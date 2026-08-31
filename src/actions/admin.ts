'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword, logAudit, requireAdmin } from '@/lib/auth';
import {
  autoSchedule,
  finalizePoomsae,
  generateDraw,
  recordBoutResult,
  renumberBouts,
  reopenBoutChain,
  walkoverBout,
} from '@/lib/tournament';
import { dispatchCertificates, issueCertificatesForCategory } from '@/lib/certificates';
import { sendSms } from '@/lib/sms';
import { categoryCode } from '@/lib/codes';
import { recalcSchoolFees } from '@/lib/school-service';
import { adminPath, eventPath } from '@/lib/paths';
import type { SeedStrategy } from '@/lib/bracket';
import { MIN_PASSWORD_LENGTH } from '@/lib/constants';

export type AdminState = { ok?: boolean; error?: string; message?: string; warnings?: string[] } | null;

/**
 * Schools per dispatch call. A PDF render plus an SMTP round trip runs to a
 * second or more each, and a serverless function is killed long before a whole
 * championship is sent.
 */
const CERTIFICATE_BATCH_SCHOOLS = 5;

/**
 * Every admin action carries the event it applies to in its form payload —
 * the admin's session is platform-wide, so the event comes from the page.
 */
async function requireEvent(formData: FormData) {
  const session = await requireAdmin();
  const eventId = String(formData.get('eventId') ?? '');
  if (!eventId) return { session, event: null, error: 'Missing event context.' as const };

  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) return { session, event: null, error: 'That event no longer exists.' as const };

  return { session, event, error: null };
}

function revalidateAdmin(eventId: string, ...extra: string[]) {
  for (const sub of ['', 'schools', 'participants', 'draws', 'schedule', 'live']) {
    revalidatePath(adminPath(eventId, sub));
  }
  for (const path of extra) revalidatePath(path);
}

// ---------------------------------------------------------------------------
// School approval
// ---------------------------------------------------------------------------
export async function reviewSchool(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };

  const schoolId = String(formData.get('schoolId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();

  const school = await db.school.findUnique({ where: { id: schoolId }, include: { participants: true } });
  if (!school || school.eventId !== event.id) return { error: 'School not found in this event.' };

  if (decision === 'APPROVE') {
    await db.$transaction(async (tx) => {
      await tx.school.update({
        where: { id: schoolId },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          reviewedBy: session.userId,
          rejectionReason: null,
        },
      });
      // Approval unlocks accreditation for the whole squad — the spec's trigger point.
      await tx.participant.updateMany({
        where: { schoolId, status: 'PENDING' },
        data: { status: 'APPROVED', accreditationIssuedAt: new Date() },
      });
    });

    await logAudit({
      userId: session.userId,
      eventId: event.id,
      action: 'SCHOOL_APPROVED',
      entityType: 'School',
      entityId: schoolId,
      detail: `${school.name} approved; ${school.participants.length} participant(s) accredited`,
    });

    await notifySchool(
      school,
      `${school.name}, your registration is APPROVED. ${school.participants.length} accreditation card(s) are ready in your dashboard.`,
    );

    revalidateAdmin(event.id, adminPath(event.id, 'accreditation'));
    return {
      ok: true,
      message: `${school.name} approved. ${school.participants.length} accreditation card${school.participants.length === 1 ? '' : 's'} released.`,
    };
  }

  if (decision === 'REJECT') {
    if (!reason) return { error: 'Give a reason so the school knows what to fix.' };

    await db.school.update({
      where: { id: schoolId },
      data: { status: 'REJECTED', reviewedBy: session.userId, rejectionReason: reason, approvedAt: null },
    });
    await db.participant.updateMany({ where: { schoolId }, data: { status: 'PENDING' } });

    await logAudit({
      userId: session.userId,
      eventId: event.id,
      action: 'SCHOOL_REJECTED',
      entityType: 'School',
      entityId: schoolId,
      detail: reason,
    });

    await notifySchool(school, `${school.name}, your registration needs changes: ${reason}. Log in to your dashboard for details.`);

    revalidateAdmin(event.id);
    return { ok: true, message: `${school.name} returned to the school with your note.` };
  }

  return { error: 'Choose approve or return.' };
}

/** Best-effort SMS/WhatsApp ping to whichever phone number the school gave us. */
async function notifySchool(school: { coachPhone: string | null; contactPhone: string | null }, body: string) {
  const to = school.coachPhone || school.contactPhone;
  if (!to) return;
  await sendSms({ to, body, channel: 'auto' });
}

export async function adminRecordPayment(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };

  const schoolId = String(formData.get('schoolId') ?? '');
  const target = await db.school.findUnique({ where: { id: schoolId }, select: { eventId: true } });
  if (!target || target.eventId !== event.id) return { error: 'School not found in this event.' };
  const action = String(formData.get('paymentAction') ?? 'RECORD');

  if (action === 'WAIVE') {
    await db.school.update({ where: { id: schoolId }, data: { paymentStatus: 'WAIVED' } });
    await logAudit({ userId: session.userId, eventId: event.id, action: 'FEE_WAIVED', entityType: 'School', entityId: schoolId });
    revalidateAdmin(event.id);
    return { ok: true, message: 'Entry fee waived for this school.' };
  }

  const amount = Number.parseInt(String(formData.get('amount') ?? ''), 10);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Enter the amount received.' };

  await db.payment.create({
    data: {
      schoolId,
      amount,
      method: String(formData.get('method') ?? 'CASH'),
      reference: String(formData.get('reference') ?? '').trim() || null,
      note: String(formData.get('note') ?? '').trim() || null,
      recordedBy: session.userId,
    },
  });
  await recalcSchoolFees(schoolId);

  await logAudit({
    userId: session.userId,
    eventId: event.id,
    action: 'PAYMENT_RECORDED',
    entityType: 'School',
    entityId: schoolId,
    detail: `₹${amount} recorded by organiser`,
  });

  revalidateAdmin(event.id);
  return { ok: true, message: `Recorded ₹${amount}.` };
}

// ---------------------------------------------------------------------------
// Master data: categories
// ---------------------------------------------------------------------------
const categorySchema = z.object({
  name: z.string().trim().min(3, 'Category name is required.'),
  discipline: z.enum(['KYORUGI', 'POOMSAE']),
  ageCategory: z.enum(['YOUTH', 'CADET', 'JUNIOR']),
  gender: z.enum(['MALE', 'FEMALE', 'MIXED']),
  weightMin: z.string().optional(),
  weightMax: z.string().optional(),
  weightLabel: z.string().trim().optional(),
  poomsaeType: z.string().trim().optional(),
});

export async function createCategory(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };

  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const input = parsed.data;

  const weightMin = input.weightMin ? Number.parseFloat(input.weightMin) : null;
  const weightMax = input.weightMax ? Number.parseFloat(input.weightMax) : null;

  if (input.discipline === 'KYORUGI' && weightMin != null && weightMax != null && weightMin >= weightMax) {
    return { error: 'The lower weight bound must be less than the upper bound.' };
  }

  const label =
    input.weightLabel ||
    (input.discipline === 'KYORUGI'
      ? weightMax != null
        ? `-${weightMax} kg`
        : weightMin != null
          ? `+${weightMin} kg`
          : 'Open'
      : null);

  const code = categoryCode({
    discipline: input.discipline,
    ageCategory: input.ageCategory,
    gender: input.gender,
    weightLabel: label,
    poomsaeType: input.poomsaeType,
  });

  const clash = await db.category.findUnique({ where: { eventId_code: { eventId: event.id, code } } });
  if (clash) return { error: `A category with code ${code} already exists (${clash.name}).` };

  const max = await db.category.aggregate({ where: { eventId: event.id }, _max: { sortOrder: true } });

  await db.category.create({
    data: {
      eventId: event.id,
      code,
      name: input.name,
      discipline: input.discipline,
      ageCategory: input.ageCategory,
      gender: input.gender,
      weightMin: input.discipline === 'KYORUGI' ? weightMin : null,
      weightMax: input.discipline === 'KYORUGI' ? weightMax : null,
      weightLabel: input.discipline === 'KYORUGI' ? label : null,
      poomsaeType: input.discipline === 'POOMSAE' ? input.poomsaeType || 'RECOGNISED' : null,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });

  await logAudit({ userId: session.userId, eventId: event.id, action: 'CATEGORY_CREATED', entityType: 'Category', detail: `${code} ${input.name}` });

  revalidatePath(adminPath(event.id, 'categories'));
  return { ok: true, message: `Created ${input.name} (${code}).` };
}

export async function toggleCategory(formData: FormData): Promise<void> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return;
  const categoryId = String(formData.get('categoryId') ?? '');

  const category = await db.category.findUnique({ where: { id: categoryId } });
  if (!category || category.eventId !== event.id) return;

  await db.category.update({ where: { id: categoryId }, data: { active: !category.active } });
  await logAudit({
    userId: session.userId,
    eventId: event.id,
    action: category.active ? 'CATEGORY_DEACTIVATED' : 'CATEGORY_ACTIVATED',
    entityType: 'Category',
    entityId: categoryId,
    detail: category.name,
  });

  revalidatePath(adminPath(event.id, 'categories'));
}

// ---------------------------------------------------------------------------
// Draws
// ---------------------------------------------------------------------------
export async function generateDrawAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };

  const categoryId = String(formData.get('categoryId') ?? '');
  const category = await db.category.findUnique({ where: { id: categoryId }, select: { eventId: true } });
  if (!category || category.eventId !== event.id) return { error: 'Category not found in this event.' };

  const strategy = (String(formData.get('strategy') ?? 'BELT') as SeedStrategy) || 'BELT';

  const result = await generateDraw(categoryId, strategy, session.userId);
  if (!result.ok) return { error: result.error };

  await renumberBouts(event.id);
  revalidateAdmin(event.id, adminPath(event.id, 'draws'), adminPath(event.id, `draws/${categoryId}`));

  return {
    ok: true,
    message:
      result.bouts === 0
        ? `Performance order set for ${result.entrants} Poomsae entr${result.entrants === 1 ? 'y' : 'ies'}.`
        : `Bracket generated: ${result.entrants} entrants, ${result.bouts} bouts, ${result.byes} bye${result.byes === 1 ? '' : 's'}.`,
  };
}

export async function generateAllDraws(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };
  const strategy = (String(formData.get('strategy') ?? 'BELT') as SeedStrategy) || 'BELT';

  const categories = await db.category.findMany({
    where: { eventId: event.id, active: true, drawStatus: { in: ['DRAFT', 'GENERATED'] } },
    include: { _count: { select: { entries: true } } },
  });

  let generated = 0;
  const skipped: string[] = [];

  for (const category of categories) {
    if (category._count.entries === 0) continue;
    const result = await generateDraw(category.id, strategy, session.userId);
    if (result.ok) generated++;
    else skipped.push(`${category.name}: ${result.error}`);
  }

  await renumberBouts(event.id);
  revalidateAdmin(event.id, adminPath(event.id, 'draws'));

  return {
    ok: true,
    message: `Generated draws for ${generated} categor${generated === 1 ? 'y' : 'ies'}.`,
    warnings: skipped.slice(0, 8),
  };
}

export async function setDrawStatus(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };

  const categoryId = String(formData.get('categoryId') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!['DRAFT', 'GENERATED', 'PUBLISHED', 'LOCKED'].includes(status)) return { error: 'Unknown draw status.' };

  const category = await db.category.findUnique({ where: { id: categoryId }, select: { eventId: true } });
  if (!category || category.eventId !== event.id) return { error: 'Category not found in this event.' };

  await db.category.update({ where: { id: categoryId }, data: { drawStatus: status } });
  await logAudit({
    userId: session.userId,
    eventId: event.id,
    action: 'DRAW_STATUS_CHANGED',
    entityType: 'Category',
    entityId: categoryId,
    detail: status,
  });

  revalidateAdmin(event.id, adminPath(event.id, 'draws'), adminPath(event.id, `draws/${categoryId}`), eventPath(event.slug, 'results'));
  return { ok: true, message: `Draw status set to ${status.toLowerCase()}.` };
}

export async function publishAllDraws(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };

  const updated = await db.category.updateMany({
    where: { eventId: event.id, drawStatus: 'GENERATED' },
    data: { drawStatus: 'PUBLISHED' },
  });
  await db.event.update({ where: { id: event.id }, data: { drawsPublished: true, registrationLocked: true } });
  await renumberBouts(event.id);

  await logAudit({
    userId: session.userId,
    eventId: event.id,
    action: 'DRAWS_PUBLISHED',
    entityType: 'Event',
    detail: `${updated.count} categor${updated.count === 1 ? 'y' : 'ies'} published; registration locked`,
  });

  revalidateAdmin(event.id, adminPath(event.id, 'draws'), eventPath(event.slug, 'results'), eventPath(event.slug, 'schedule'));
  return {
    ok: true,
    message: `Published ${updated.count} draw${updated.count === 1 ? '' : 's'}. Registration is now locked and the public page is live.`,
  };
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------
export async function autoScheduleAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };

  const startRaw = String(formData.get('startAt') ?? '');
  const minutes = Number.parseInt(String(formData.get('minutes') ?? '12'), 10);

  const startAt = startRaw ? new Date(startRaw) : null;
  if (!startAt || Number.isNaN(startAt.getTime())) return { error: 'Pick a valid start time.' };
  if (!Number.isFinite(minutes) || minutes < 3 || minutes > 60) return { error: 'Minutes per bout must be between 3 and 60.' };

  const count = await autoSchedule(event.id, startAt, minutes);
  await logAudit({
    userId: session.userId,
    eventId: event.id,
    action: 'AUTO_SCHEDULED',
    entityType: 'Bout',
    detail: `${count} bouts from ${startAt.toISOString()} at ${minutes} min each`,
  });

  revalidateAdmin(event.id, adminPath(event.id, 'schedule'), eventPath(event.slug, 'schedule'));
  return { ok: true, message: `Scheduled ${count} bout${count === 1 ? '' : 's'} across the active mats.` };
}

export async function updateBoutSchedule(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };

  const boutId = String(formData.get('boutId') ?? '');
  const matId = String(formData.get('matId') ?? '');
  const scheduledAtRaw = String(formData.get('scheduledAt') ?? '');
  const refereeId = String(formData.get('refereeId') ?? '');

  const bout = await db.bout.findUnique({ where: { id: boutId }, include: { category: { select: { eventId: true } } } });
  if (!bout || bout.category.eventId !== event.id) return { error: 'Bout not found in this event.' };

  const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
  if (scheduledAtRaw && Number.isNaN(scheduledAt!.getTime())) return { error: 'Invalid time.' };

  await db.bout.update({
    where: { id: boutId },
    data: {
      matId: matId || null,
      scheduledAt,
      refereeId: refereeId || null,
    },
  });

  await logAudit({
    userId: session.userId,
    eventId: event.id,
    action: 'BOUT_SCHEDULED',
    entityType: 'Bout',
    entityId: boutId,
    detail: `mat=${matId || 'none'} at=${scheduledAtRaw || 'none'} referee=${refereeId || 'none'}`,
  });

  revalidateAdmin(event.id, adminPath(event.id, 'schedule'), eventPath(event.slug, 'schedule'));
  return { ok: true, message: 'Bout updated.' };
}

// ---------------------------------------------------------------------------
// Mats & officials
// ---------------------------------------------------------------------------
export async function saveMat(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };

  const name = String(formData.get('name') ?? '').trim();
  const venue = String(formData.get('venue') ?? '').trim();
  if (!name) return { error: 'Mat name is required.' };

  const existing = await db.mat.findUnique({ where: { eventId_name: { eventId: event.id, name } } });
  if (existing) return { error: `${name} already exists in this event.` };

  const max = await db.mat.aggregate({ where: { eventId: event.id }, _max: { sortOrder: true } });
  await db.mat.create({
    data: { eventId: event.id, name, venue: venue || null, sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });

  await logAudit({ userId: session.userId, eventId: event.id, action: 'MAT_CREATED', entityType: 'Mat', detail: name });
  revalidatePath(adminPath(event.id, 'mats'));
  return { ok: true, message: `${name} added.` };
}

export async function toggleMat(formData: FormData): Promise<void> {
  const { event, error } = await requireEvent(formData);
  if (error) return;
  const matId = String(formData.get('matId') ?? '');
  const mat = await db.mat.findUnique({ where: { id: matId } });
  if (!mat || mat.eventId !== event.id) return;
  await db.mat.update({ where: { id: matId }, data: { active: !mat.active } });
  revalidatePath(adminPath(event.id, 'mats'));
}

const officialSchema = z.object({
  name: z.string().trim().min(2, 'Name is required.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email.'),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`),
  certification: z.string().trim().optional(),
  assignedMatId: z.string().optional(),
  isJury: z.string().optional(),
});

export async function createOfficial(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };

  const parsed = officialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const input = parsed.data;

  const existing = await db.user.findFirst({ where: { email: input.email, eventId: event.id } });
  if (existing) return { error: 'An account in this event already uses that email.' };

  await db.user.create({
    data: {
      eventId: event.id,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      name: input.name,
      role: 'REFEREE',
      certification: input.certification || null,
      assignedMatId: input.assignedMatId || null,
      isJury: input.isJury === 'on',
    },
  });

  await logAudit({ userId: session.userId, eventId: event.id, action: 'OFFICIAL_CREATED', entityType: 'User', detail: `${input.name} <${input.email}>` });
  revalidatePath(adminPath(event.id, 'officials'));
  return { ok: true, message: `${input.name} can now sign in to the scoring panel.` };
}

/**
 * Sets a new password on a school's login. Schools have no self-serve recovery,
 * and the registration page tells coaches to ask the organising team — this is
 * what makes that true.
 */
export async function resetSchoolPassword(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };

  const schoolId = String(formData.get('schoolId') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');

  const school = await db.school.findFirst({ where: { id: schoolId, eventId: event.id } });
  if (!school) return { error: 'School not found in this event.' };
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { error: `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const user = await db.user.findFirst({ where: { schoolId: school.id, eventId: event.id, role: 'SCHOOL' } });
  if (!user) return { error: 'This school has no login on file. Ask them to register again.' };

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), active: true },
  });

  await logAudit({
    userId: session.userId,
    eventId: event.id,
    action: 'SCHOOL_PASSWORD_RESET',
    entityType: 'School',
    entityId: school.id,
    detail: `${school.name} (${school.code}) — login ${user.email}`,
  });

  revalidateAdmin(event.id, adminPath(event.id, `schools/${school.id}`));
  return {
    ok: true,
    message: `Password updated for ${user.email}. Pass it to the school directly — it is not emailed.`,
  };
}

export async function updateOfficial(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };

  const userId = String(formData.get('userId') ?? '');
  const assignedMatId = String(formData.get('assignedMatId') ?? '');
  const isJury = String(formData.get('isJury') ?? '') === 'on';
  const active = String(formData.get('active') ?? '') === 'on';
  const newPassword = String(formData.get('newPassword') ?? '');

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'REFEREE' || user.eventId !== event.id) {
    return { error: 'Official not found in this event.' };
  }
  if (newPassword && newPassword.length < MIN_PASSWORD_LENGTH)
    return { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` };

  await db.user.update({
    where: { id: userId },
    data: {
      assignedMatId: assignedMatId || null,
      isJury,
      active,
      ...(newPassword ? { passwordHash: await hashPassword(newPassword) } : {}),
    },
  });

  await logAudit({
    userId: session.userId,
    eventId: event.id,
    action: 'OFFICIAL_UPDATED',
    entityType: 'User',
    entityId: userId,
    detail: `mat=${assignedMatId || 'none'} jury=${isJury} active=${active}${newPassword ? ' password reset' : ''}`,
  });

  revalidatePath(adminPath(event.id, 'officials'));
  return { ok: true, message: `${user.name} updated.` };
}

// ---------------------------------------------------------------------------
// Venue check-in & weigh-in
// ---------------------------------------------------------------------------
function extractParticipantCode(raw: string): string {
  const trimmed = raw.trim();
  const tail = trimmed.split('/').filter(Boolean).pop() ?? trimmed;
  return tail.toUpperCase();
}

async function findParticipantByCode(eventId: string, rawCode: string) {
  const code = extractParticipantCode(rawCode);
  if (!code) return null;
  return db.participant.findFirst({
    where: { code, school: { eventId } },
    include: { school: true },
  });
}

export async function checkInParticipant(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };
  const code = String(formData.get('code') ?? '');

  const participant = await findParticipantByCode(event.id, code);
  if (!participant) return { error: `No participant found for "${code}".` };
  if (participant.status !== 'APPROVED') {
    return { error: `${participant.name} (${participant.code}) is not yet approved — check with accreditation before letting them through.` };
  }
  if (participant.checkedInAt) {
    return { ok: true, message: `${participant.name} was already checked in at ${participant.checkedInAt.toLocaleString('en-IN')}.` };
  }

  await db.participant.update({ where: { id: participant.id }, data: { checkedInAt: new Date() } });
  await logAudit({
    userId: session.userId,
    eventId: event.id,
    action: 'PARTICIPANT_CHECKED_IN',
    entityType: 'Participant',
    entityId: participant.id,
    detail: `${participant.name} (${participant.code})`,
  });

  if (participant.phone) {
    await sendSms({
      to: participant.phone,
      channel: 'auto',
      body: `${participant.name}, you're checked in for the championship. Head to your mat when called.`,
    });
  }

  revalidatePath(adminPath(event.id, 'checkin'));
  return { ok: true, message: `${participant.name} (${participant.code}) checked in.` };
}

export async function recordWeighIn(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };
  const code = String(formData.get('code') ?? '');
  const weight = Number.parseFloat(String(formData.get('weight') ?? ''));

  if (!Number.isFinite(weight) || weight <= 0) return { error: 'Enter the weigh-in weight in kg.' };

  const participant = await findParticipantByCode(event.id, code);
  if (!participant) return { error: `No participant found for "${code}".` };

  await db.participant.update({
    where: { id: participant.id },
    data: { weighInAt: new Date(), weighInWeight: weight },
  });
  await logAudit({
    userId: session.userId,
    eventId: event.id,
    action: 'PARTICIPANT_WEIGHED_IN',
    entityType: 'Participant',
    entityId: participant.id,
    detail: `${participant.name} (${participant.code}) weighed ${weight}kg, declared ${participant.weightKg}kg`,
  });

  if (participant.phone) {
    await sendSms({
      to: participant.phone,
      channel: 'auto',
      body: `${participant.name}, your weigh-in is recorded: ${weight}kg.`,
    });
  }

  revalidatePath(adminPath(event.id, 'checkin'));

  const diff = Math.abs(weight - participant.weightKg);
  const warnings = diff > 2 ? [`Declared weight was ${participant.weightKg}kg — a ${diff.toFixed(1)}kg gap may put them outside their division.`] : undefined;

  return { ok: true, message: `Weigh-in recorded: ${weight}kg.`, warnings };
}

// ---------------------------------------------------------------------------
// Live control: overrides, walkovers, Poomsae finalisation
// ---------------------------------------------------------------------------
export async function overrideBoutResult(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };

  const boutId = String(formData.get('boutId') ?? '');
  const bout = await db.bout.findUnique({ where: { id: boutId }, include: { category: { select: { eventId: true } } } });
  if (!bout || bout.category.eventId !== event.id) return { error: 'Bout not found in this event.' };
  const winner = String(formData.get('winner') ?? '') as 'RED' | 'BLUE';
  const resultType = String(formData.get('resultType') ?? 'POINTS');
  const redScore = Number.parseInt(String(formData.get('redScore') ?? '0'), 10) || 0;
  const blueScore = Number.parseInt(String(formData.get('blueScore') ?? '0'), 10) || 0;

  if (winner !== 'RED' && winner !== 'BLUE') return { error: 'Choose the winning corner.' };

  const result =
    resultType === 'WALKOVER' || resultType === 'WITHDRAWAL'
      ? await walkoverBout(boutId, winner, resultType, session.userId)
      : await recordBoutResult({ boutId, winner, resultType, redScore, blueScore, actorId: session.userId });

  if (!result.ok) return { error: result.error };

  revalidateAdmin(event.id, adminPath(event.id, 'live'), eventPath(event.slug, 'results'), eventPath(event.slug, 'medal-tally'));
  return {
    ok: true,
    message: result.categoryFinalized
      ? 'Result recorded. That completed the category — medals are now on the tally.'
      : 'Result recorded and the winner advanced.',
  };
}

/**
 * Clears the bouts fought after `boutId` so an earlier result can be corrected.
 * Paired with the guard in recordBoutResult, which refuses a correction that
 * would change who advances while those bouts still stand.
 */
export async function reopenBoutChainAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };

  const boutId = String(formData.get('boutId') ?? '');
  const bout = await db.bout.findUnique({
    where: { id: boutId },
    include: { category: { select: { eventId: true, name: true } } },
  });
  if (!bout || bout.category.eventId !== event.id) return { error: 'Bout not found in this event.' };

  const result = await reopenBoutChain(boutId, session.userId);
  if (!result.ok) return { error: result.error };
  if (result.reopened === 0) {
    return { ok: true, message: 'Nothing after this bout has been fought — you can correct it directly.' };
  }

  revalidateAdmin(event.id, adminPath(event.id, 'live'), eventPath(event.slug, 'results'), eventPath(event.slug, 'medal-tally'));
  return {
    ok: true,
    message:
      `Reopened ${result.reopened} bout(s) in ${bout.category.name}. ` +
      'Record the corrected result now, then re-run the bouts that followed.',
  };
}

export async function clearDispute(formData: FormData): Promise<void> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return;
  const boutId = String(formData.get('boutId') ?? '');

  const bout = await db.bout.findUnique({ where: { id: boutId }, include: { category: { select: { eventId: true } } } });
  if (!bout || bout.category.eventId !== event.id) return;

  await db.bout.update({ where: { id: boutId }, data: { disputeFlag: false } });
  await logAudit({ userId: session.userId, eventId: event.id, action: 'DISPUTE_CLEARED', entityType: 'Bout', entityId: boutId });
  revalidatePath(adminPath(event.id, 'live'));
}

export async function finalizePoomsaeAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };
  const categoryId = String(formData.get('categoryId') ?? '');

  const category = await db.category.findUnique({ where: { id: categoryId }, select: { eventId: true } });
  if (!category || category.eventId !== event.id) return { error: 'Category not found in this event.' };

  const result = await finalizePoomsae(categoryId, session.userId);
  if (!result.ok) return { error: result.error };

  revalidateAdmin(event.id, adminPath(event.id, 'live'), eventPath(event.slug, 'results'), eventPath(event.slug, 'medal-tally'));
  return { ok: true, message: `Ranked ${result.ranked} entries and awarded medals.` };
}

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------
export async function issueCertificatesAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };
  const categoryId = String(formData.get('categoryId') ?? '');

  if (categoryId === 'ALL') {
    const finalized = await db.category.findMany({
      where: { eventId: event.id, finalized: true },
      select: { id: true, name: true },
    });
    let created = 0;
    const warnings: string[] = [];

    for (const category of finalized) {
      const result = await issueCertificatesForCategory(event, category.id, session.userId);
      if (result.ok) created += result.created;
      else warnings.push(`${category.name}: ${result.error}`);
    }

    revalidatePath(adminPath(event.id, 'certificates'));
    return { ok: true, message: `Issued ${created} certificate${created === 1 ? '' : 's'} across ${finalized.length} finalised categor${finalized.length === 1 ? 'y' : 'ies'}.`, warnings };
  }

  const result = await issueCertificatesForCategory(event, categoryId, session.userId);
  if (!result.ok) return { error: result.error };

  revalidatePath(adminPath(event.id, 'certificates'));
  return {
    ok: true,
    message: `Issued ${result.created} certificate${result.created === 1 ? '' : 's'}${result.skipped ? `; ${result.skipped} already existed` : ''}.`,
  };
}

export async function dispatchCertificatesAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };

  const schoolId = String(formData.get('schoolId') ?? '');
  const categoryId = String(formData.get('categoryId') ?? '');
  const resend = String(formData.get('resend') ?? '') === 'on';

  const result = await dispatchCertificates(
    event,
    {
      schoolId: schoolId || undefined,
      categoryId: categoryId || undefined,
      onlyUnsent: !resend,
      limit: CERTIFICATE_BATCH_SCHOOLS,
    },
    session.userId,
  );

  revalidatePath(adminPath(event.id, 'certificates'));

  if (result.emails === 0 && result.failures.length === 0) {
    return { ok: true, message: 'Nothing to send — every certificate in that selection has already been emailed.' };
  }

  const sent = `Sent ${result.certificates} certificate${result.certificates === 1 ? '' : 's'} in ${result.emails} email${result.emails === 1 ? '' : 's'}.`;

  return {
    ok: true,
    message:
      result.remaining > 0
        ? `${sent} ${result.remaining} school${result.remaining === 1 ? '' : 's'} still to go — press Send again to continue. Nothing is sent twice.`
        : sent,
    warnings: result.failures,
  };
}

// ---------------------------------------------------------------------------
// Event settings
// ---------------------------------------------------------------------------
const settingsSchema = z.object({
  eventName: z.string().trim().min(3),
  edition: z.string().trim().min(1),
  organiser: z.string().trim().min(2),
  venue: z.string().trim().min(2),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  registrationOpensAt: z.string().min(1),
  registrationClosesAt: z.string().min(1),
  ageReferenceDate: z.string().min(1),
  feePerParticipant: z.coerce.number().int().min(0),
  pointsGold: z.coerce.number().int().min(0),
  pointsSilver: z.coerce.number().int().min(0),
  pointsBronze: z.coerce.number().int().min(0),
  signatory1Name: z.string().trim().min(2),
  signatory1Title: z.string().trim().min(2),
  signatory2Name: z.string().trim().min(2),
  signatory2Title: z.string().trim().min(2),
});

export async function updateSettings(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { session, event, error } = await requireEvent(formData);
  if (error) return { error };

  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const input = parsed.data;

  const dates = {
    startDate: new Date(input.startDate),
    endDate: new Date(input.endDate),
    registrationOpensAt: new Date(input.registrationOpensAt),
    registrationClosesAt: new Date(input.registrationClosesAt),
    ageReferenceDate: new Date(input.ageReferenceDate),
  };
  for (const [key, value] of Object.entries(dates)) {
    if (Number.isNaN(value.getTime())) return { error: `${key} is not a valid date.` };
  }
  if (dates.endDate < dates.startDate) return { error: 'The event cannot end before it starts.' };
  if (dates.registrationClosesAt < dates.registrationOpensAt) {
    return { error: 'Registration cannot close before it opens.' };
  }

  const previous = event;

  await db.event.update({
    where: { id: event.id },
    data: {
      eventName: input.eventName,
      edition: input.edition,
      organiser: input.organiser,
      venue: input.venue,
      ...dates,
      feePerParticipant: input.feePerParticipant,
      pointsGold: input.pointsGold,
      pointsSilver: input.pointsSilver,
      pointsBronze: input.pointsBronze,
      signatory1Name: input.signatory1Name,
      signatory1Title: input.signatory1Title,
      signatory2Name: input.signatory2Name,
      signatory2Title: input.signatory2Title,
      registrationLocked: String(formData.get('registrationLocked') ?? '') === 'on',
      drawsPublished: String(formData.get('drawsPublished') ?? '') === 'on',
      resultsPublished: String(formData.get('resultsPublished') ?? '') === 'on',
    },
  });

  const warnings: string[] = [];

  // A changed reference date silently reclassifies everyone — recompute rather
  // than leaving stale categories behind.
  if (previous.ageReferenceDate.getTime() !== dates.ageReferenceDate.getTime()) {
    const { classifyAge } = await import('@/lib/age');
    const participants = await db.participant.findMany({ where: { school: { eventId: event.id } } });
    let moved = 0;

    for (const participant of participants) {
      const classification = classifyAge(participant.dob, dates.ageReferenceDate);
      if (!classification.ok) {
        warnings.push(`${participant.name} (${participant.code}) now falls outside every age category.`);
        continue;
      }
      if (classification.ageCategory !== participant.ageCategory || classification.age !== participant.ageAtRef) {
        await db.participant.update({
          where: { id: participant.id },
          data: { ageCategory: classification.ageCategory, ageAtRef: classification.age },
        });
        moved++;
      }
    }
    if (moved) warnings.push(`${moved} participant(s) were reclassified. Regenerate affected draws.`);
  }

  if (previous.feePerParticipant !== input.feePerParticipant) {
    const schools = await db.school.findMany({ where: { eventId: event.id }, select: { id: true } });
    for (const school of schools) await recalcSchoolFees(school.id);
    warnings.push('Entry fees recalculated for every school.');
  }

  await logAudit({ userId: session.userId, eventId: event.id, action: 'SETTINGS_UPDATED', entityType: 'Event' });

  revalidateAdmin(event.id, adminPath(event.id, 'settings'), eventPath(event.slug));
  return { ok: true, message: 'Event settings saved.', warnings };
}
