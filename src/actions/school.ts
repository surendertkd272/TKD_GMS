'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { db } from '@/lib/db';
import { logAudit, requireSchool } from '@/lib/auth';
import { classifyAge } from '@/lib/age';
import { nextParticipantCode } from '@/lib/codes';
import { syncParticipantEntries } from '@/lib/tournament';
import { schoolPath } from '@/lib/paths';
import { parseCsvTable } from '@/lib/csv';
import { BELT_GRADES, PERSON_ROLES } from '@/lib/constants';
import { CSV_TEMPLATE_HEADERS, recalcSchoolFees } from '@/lib/school-service';

export type SchoolActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  warnings?: string[];
} | null;

const PHOTO_DIR = path.join(process.cwd(), 'public', 'uploads', 'photos');
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Institution profile
// ---------------------------------------------------------------------------
const profileSchema = z.object({
  name: z.string().trim().min(3, 'School name is required.'),
  boardAffiliation: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  principalName: z.string().trim().optional(),
  coachName: z.string().trim().min(2, 'Coach / teacher-in-charge is required.'),
  coachPhone: z.string().trim().optional(),
  contactEmail: z.string().trim().toLowerCase().email('Enter a valid email.'),
  contactPhone: z.string().trim().optional(),
});

export async function saveSchoolProfile(
  _prev: SchoolActionState,
  formData: FormData,
): Promise<SchoolActionState> {
  const { session, school, event } = await requireSchool();

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  await db.school.update({
    where: { id: school.id },
    data: {
      ...parsed.data,
      boardAffiliation: parsed.data.boardAffiliation || null,
      address: parsed.data.address || null,
      city: parsed.data.city || null,
      state: parsed.data.state || null,
      principalName: parsed.data.principalName || null,
      coachPhone: parsed.data.coachPhone || null,
      contactPhone: parsed.data.contactPhone || null,
    },
  });

  await logAudit({
    userId: session.userId,
    action: 'SCHOOL_PROFILE_UPDATED',
    entityType: 'School',
    entityId: school.id,
  });

  revalidatePath(schoolPath(event.slug, 'profile'));
  revalidatePath(schoolPath(event.slug));
  return { ok: true, message: 'Institution details saved. They are reused on every future entry.' };
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------
const participantSchema = z.object({
  name: z.string().trim().min(2, 'Participant name is required.'),
  gender: z.enum(['MALE', 'FEMALE']),
  dob: z.string().min(1, 'Date of birth is required.'),
  weightKg: z.coerce.number().positive('Enter the weight in kilograms.').max(200, 'Check the weight.'),
  beltGrade: z.string().trim().min(1, 'Belt grade is required.'),
  personRole: z.enum(PERSON_ROLES),
  events: z.array(z.enum(['KYORUGI', 'POOMSAE'])).default([]),
  email: z.string().trim().toLowerCase().email('Enter a valid participant email.').optional().or(z.literal('')),
  phone: z.string().trim().optional(),
  emergencyContactName: z.string().trim().optional(),
  emergencyContactPhone: z.string().trim().optional(),
  medalNotes: z.string().trim().optional(),
  medicalNotes: z.string().trim().optional(),
  allowDuplicate: z.string().optional(),
});

function readParticipantForm(formData: FormData) {
  const events = formData.getAll('events').map(String).filter((e) => e === 'KYORUGI' || e === 'POOMSAE');
  return participantSchema.safeParse({
    ...Object.fromEntries(formData),
    events,
  });
}

async function assertRegistrationOpen(
  event: { registrationLocked: boolean },
  schoolId: string,
): Promise<string | null> {
  if (event.registrationLocked) {
    return 'Registration is closed. Contact the organising team for a late change.';
  }
  const school = await db.school.findUnique({ where: { id: schoolId }, select: { status: true } });
  if (school?.status === 'REJECTED') {
    return 'This school account was rejected. Contact the organising team.';
  }
  return null;
}

async function savePhoto(participantId: string, file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Photo must be under 3 MB.');

  const type = file.type.toLowerCase();
  const ext = type === 'image/png' ? 'png' : type === 'image/jpeg' || type === 'image/jpg' ? 'jpg' : null;
  if (!ext) throw new Error('Photo must be a JPG or PNG file.');

  await mkdir(PHOTO_DIR, { recursive: true });
  const filename = `${participantId}.${ext}`;
  await writeFile(path.join(PHOTO_DIR, filename), Buffer.from(await file.arrayBuffer()));
  return `/uploads/photos/${filename}`;
}

export async function createParticipant(
  _prev: SchoolActionState,
  formData: FormData,
): Promise<SchoolActionState> {
  const { session, school, event } = await requireSchool();

  const blocked = await assertRegistrationOpen(event, school.id);
  if (blocked) return { error: blocked };

  const parsed = readParticipantForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const input = parsed.data;

  const dob = new Date(input.dob);
  if (Number.isNaN(dob.getTime())) return { error: 'Date of birth is not a valid date.' };

  const classification = classifyAge(dob, event.ageReferenceDate);
  if (!classification.ok) return { error: classification.reason };

  // Duplicate guard — the spec asks for these to be flagged before submission.
  const duplicate = await db.participant.findFirst({
    where: { schoolId: school.id, name: input.name, dob },
    select: { id: true, code: true },
  });
  if (duplicate && input.allowDuplicate !== 'on') {
    return {
      error: `${input.name} with the same date of birth is already entered as ${duplicate.code}. Tick "this is a different person" to add anyway.`,
    };
  }

  const isAthlete = input.personRole === 'ATHLETE';
  if (isAthlete && input.events.length === 0) {
    return { error: 'Select at least one event (Kyorugi, Poomsae, or both) for an athlete.' };
  }

  const code = await nextParticipantCode(event.shortCode);

  let participant;
  try {
    participant = await db.participant.create({
      data: {
        code,
        schoolId: school.id,
        name: input.name,
        gender: input.gender,
        dob,
        ageCategory: classification.ageCategory,
        ageAtRef: classification.age,
        weightKg: input.weightKg,
        beltGrade: input.beltGrade,
        personRole: input.personRole,
        email: input.email || null,
        phone: input.phone || null,
        emergencyContactName: input.emergencyContactName || null,
        emergencyContactPhone: input.emergencyContactPhone || null,
        medicalNotes: input.medicalNotes || null,
        status: school.status === 'APPROVED' ? 'APPROVED' : 'PENDING',
      },
    });
  } catch {
    return { error: 'Could not save the participant — the generated ID collided. Please try again.' };
  }

  const warnings: string[] = [];

  try {
    const photoPath = await savePhoto(participant.id, formData.get('photo') as File | null);
    if (photoPath) await db.participant.update({ where: { id: participant.id }, data: { photoPath } });
    else warnings.push('No photo uploaded — the accreditation card will print with an empty photo box.');
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : 'Photo could not be saved.');
  }

  if (isAthlete) {
    const sync = await syncParticipantEntries(participant.id, input.events);
    warnings.push(...sync.warnings);
  }

  await recalcSchoolFees(school.id);

  await logAudit({
    userId: session.userId,
    action: 'PARTICIPANT_CREATED',
    entityType: 'Participant',
    entityId: participant.id,
    detail: `${participant.code} ${participant.name} (${classification.ageCategory})`,
  });

  revalidatePath(schoolPath(event.slug, 'participants'));
  revalidatePath(schoolPath(event.slug));
  redirect(`${schoolPath(event.slug, 'participants')}?created=${participant.code}${warnings.length ? `&warn=${encodeURIComponent(warnings.join(' | '))}` : ''}`);
}

export async function updateParticipant(
  _prev: SchoolActionState,
  formData: FormData,
): Promise<SchoolActionState> {
  const { session, school, event } = await requireSchool();
  const participantId = String(formData.get('participantId') ?? '');

  const existing = await db.participant.findFirst({
    where: { id: participantId, schoolId: school.id },
    include: { entries: { include: { category: true } } },
  });
  if (!existing) return { error: 'Participant not found.' };

  const blocked = await assertRegistrationOpen(event, school.id);
  if (blocked) return { error: blocked };

  const parsed = readParticipantForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const input = parsed.data;

  const dob = new Date(input.dob);
  const classification = classifyAge(dob, event.ageReferenceDate);
  if (!classification.ok) return { error: classification.reason };

  const warnings: string[] = [];
  const detailsChanged =
    existing.name !== input.name ||
    existing.gender !== input.gender ||
    existing.dob.getTime() !== dob.getTime() ||
    existing.weightKg !== input.weightKg ||
    existing.beltGrade !== input.beltGrade ||
    existing.personRole !== input.personRole;

  await db.participant.update({
    where: { id: existing.id },
    data: {
      name: input.name,
      gender: input.gender,
      dob,
      ageCategory: classification.ageCategory,
      ageAtRef: classification.age,
      weightKg: input.weightKg,
      beltGrade: input.beltGrade,
      personRole: input.personRole,
      email: input.email || null,
      phone: input.phone || null,
      emergencyContactName: input.emergencyContactName || null,
      emergencyContactPhone: input.emergencyContactPhone || null,
      medicalNotes: input.medicalNotes || null,
      // Bump the card revision so an already-printed card is visibly superseded.
      accreditationVersion: detailsChanged ? existing.accreditationVersion + 1 : existing.accreditationVersion,
      accreditationIssuedAt: detailsChanged ? null : existing.accreditationIssuedAt,
    },
  });

  try {
    const photoPath = await savePhoto(existing.id, formData.get('photo') as File | null);
    if (photoPath) await db.participant.update({ where: { id: existing.id }, data: { photoPath } });
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : 'Photo could not be saved.');
  }

  if (input.personRole === 'ATHLETE') {
    const sync = await syncParticipantEntries(existing.id, input.events);
    warnings.push(...sync.warnings);
    if (sync.created.length) warnings.push(`Moved into: ${sync.created.join(', ')}.`);
  }

  await recalcSchoolFees(school.id);

  await logAudit({
    userId: session.userId,
    action: 'PARTICIPANT_UPDATED',
    entityType: 'Participant',
    entityId: existing.id,
    detail: detailsChanged ? 'Details changed — accreditation card reissued' : 'Contact details updated',
  });

  revalidatePath(schoolPath(event.slug, 'participants'));
  revalidatePath(schoolPath(event.slug, `participants/${existing.id}`));
  revalidatePath(schoolPath(event.slug, 'accreditation'));

  return {
    ok: true,
    message: detailsChanged
      ? 'Saved. The accreditation card has been reissued at a new revision.'
      : 'Saved.',
    warnings,
  };
}

export async function deleteParticipant(formData: FormData): Promise<void> {
  const { session, school, event } = await requireSchool();
  const participantId = String(formData.get('participantId') ?? '');

  const participant = await db.participant.findFirst({
    where: { id: participantId, schoolId: school.id },
    include: { entries: { include: { category: true } } },
  });
  if (!participant) return;

  const inLiveDraw = participant.entries.some(
    (e) => e.category.drawStatus === 'PUBLISHED' || e.category.drawStatus === 'LOCKED',
  );

  if (inLiveDraw) {
    // Never vanish an athlete out of a live bracket — withdraw instead.
    await db.participant.update({ where: { id: participant.id }, data: { status: 'WITHDRAWN' } });
    await db.entry.updateMany({ where: { participantId: participant.id }, data: { status: 'WITHDRAWN' } });
    await logAudit({
      userId: session.userId,
      action: 'PARTICIPANT_WITHDRAWN',
      entityType: 'Participant',
      entityId: participant.id,
      detail: 'Withdrawn (draw already published, so the record is retained)',
    });
  } else {
    if (participant.photoPath) {
      await unlink(path.join(process.cwd(), 'public', participant.photoPath.replace(/^\/+/, ''))).catch(() => {});
    }
    await db.participant.delete({ where: { id: participant.id } });
    await logAudit({
      userId: session.userId,
      action: 'PARTICIPANT_DELETED',
      entityType: 'Participant',
      entityId: participant.id,
      detail: `${participant.code} ${participant.name}`,
    });
  }

  await recalcSchoolFees(school.id);
  revalidatePath(schoolPath(event.slug, 'participants'));
  revalidatePath(schoolPath(event.slug));
  redirect(schoolPath(event.slug, 'participants'));
}

// ---------------------------------------------------------------------------
// Bulk CSV upload
// ---------------------------------------------------------------------------
export type BulkRowResult = {
  row: number;
  name: string;
  status: 'CREATED' | 'SKIPPED' | 'ERROR';
  detail: string;
};

export type BulkUploadState = {
  error?: string;
  summary?: { created: number; skipped: number; failed: number; total: number };
  rows?: BulkRowResult[];
} | null;

const GENDER_ALIASES: Record<string, 'MALE' | 'FEMALE'> = {
  m: 'MALE',
  male: 'MALE',
  boy: 'MALE',
  b: 'MALE',
  f: 'FEMALE',
  female: 'FEMALE',
  girl: 'FEMALE',
  g: 'FEMALE',
};

/** Accepts dd/mm/yyyy, dd-mm-yyyy and yyyy-mm-dd — all appear in school records. */
function parseFlexibleDate(raw: string): Date | null {
  const value = raw.trim();
  if (!value) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (iso) return buildDate(+iso[1]!, +iso[2]!, +iso[3]!);

  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(value);
  if (dmy) return buildDate(+dmy[3]!, +dmy[2]!, +dmy[1]!);

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function matchBelt(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  const exact = BELT_GRADES.find((b) => b.toLowerCase() === value);
  if (exact) return exact;
  const partial = BELT_GRADES.find((b) => b.toLowerCase().startsWith(value) || value.startsWith(b.toLowerCase()));
  return partial ?? null;
}

export async function bulkUploadParticipants(
  _prev: BulkUploadState,
  formData: FormData,
): Promise<BulkUploadState> {
  const { session, school, event } = await requireSchool();

  const blocked = await assertRegistrationOpen(event, school.id);
  if (blocked) return { error: blocked };

  const file = formData.get('csv') as File | null;
  if (!file || file.size === 0) return { error: 'Choose a CSV file to upload.' };
  if (file.size > 2 * 1024 * 1024) return { error: 'CSV must be under 2 MB.' };

  const table = parseCsvTable(await file.text());
  if (!table.rows.length) return { error: 'That CSV has a header row but no data rows.' };
  if (!('name' in (table.rows[0] ?? {}))) {
    return {
      error: `Could not find a "name" column. Expected headers: ${CSV_TEMPLATE_HEADERS.join(', ')}.`,
    };
  }

  const results: BulkRowResult[] = [];
  const seenInFile = new Set<string>();

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i]!;
    const rowNo = i + 2; // +1 header, +1 to 1-index
    const name = row.name?.trim() ?? '';

    if (!name) {
      results.push({ row: rowNo, name: '(blank)', status: 'ERROR', detail: 'Name is empty.' });
      continue;
    }

    const gender = GENDER_ALIASES[(row.gender ?? '').trim().toLowerCase()];
    if (!gender) {
      results.push({ row: rowNo, name, status: 'ERROR', detail: `Gender "${row.gender}" not recognised (use M/F).` });
      continue;
    }

    const dob = parseFlexibleDate(row.dob ?? '');
    if (!dob) {
      results.push({ row: rowNo, name, status: 'ERROR', detail: `Date of birth "${row.dob}" not recognised (use dd/mm/yyyy).` });
      continue;
    }

    const classification = classifyAge(dob, event.ageReferenceDate);
    if (!classification.ok) {
      results.push({ row: rowNo, name, status: 'ERROR', detail: classification.reason });
      continue;
    }

    const weight = Number.parseFloat(row.weightkg || row.weight || '');
    if (!Number.isFinite(weight) || weight <= 0) {
      results.push({ row: rowNo, name, status: 'ERROR', detail: 'Weight (kg) is missing or not a number.' });
      continue;
    }

    const belt = matchBelt(row.beltgrade || row.belt || '');
    if (!belt) {
      results.push({ row: rowNo, name, status: 'ERROR', detail: `Belt grade "${row.beltgrade}" not recognised.` });
      continue;
    }

    const personRole =
      PERSON_ROLES.find((r) => r.toLowerCase() === (row.role ?? '').trim().toLowerCase()) ?? 'ATHLETE';

    const eventsRaw = (row.events ?? row.event ?? '').toLowerCase();
    const events: ('KYORUGI' | 'POOMSAE')[] = [];
    if (/kyorugi|spar|fight|both|all/.test(eventsRaw)) events.push('KYORUGI');
    if (/poomsae|form|both|all/.test(eventsRaw)) events.push('POOMSAE');
    if (personRole === 'ATHLETE' && !events.length) {
      results.push({ row: rowNo, name, status: 'ERROR', detail: 'Events column must say Kyorugi, Poomsae or Both.' });
      continue;
    }

    const dupKey = `${name.toLowerCase()}|${dob.toISOString().slice(0, 10)}`;
    if (seenInFile.has(dupKey)) {
      results.push({ row: rowNo, name, status: 'SKIPPED', detail: 'Duplicate of an earlier row in this file.' });
      continue;
    }
    seenInFile.add(dupKey);

    const existing = await db.participant.findFirst({
      where: { schoolId: school.id, name, dob },
      select: { code: true },
    });
    if (existing) {
      results.push({ row: rowNo, name, status: 'SKIPPED', detail: `Already entered as ${existing.code}.` });
      continue;
    }

    const participant = await db.participant.create({
      data: {
        code: await nextParticipantCode(event.shortCode),
        schoolId: school.id,
        name,
        gender,
        dob,
        ageCategory: classification.ageCategory,
        ageAtRef: classification.age,
        weightKg: weight,
        beltGrade: belt,
        personRole,
        email: row.email || null,
        phone: row.phone || null,
        emergencyContactName: row.emergencycontactname || null,
        emergencyContactPhone: row.emergencycontactphone || null,
        medicalNotes: row.medicalnotes || null,
        status: school.status === 'APPROVED' ? 'APPROVED' : 'PENDING',
      },
    });

    let detail = `${participant.code} · ${classification.ageCategory} · ${weight} kg`;
    if (personRole === 'ATHLETE') {
      const sync = await syncParticipantEntries(participant.id, events);
      if (sync.created.length) detail += ` → ${sync.created.join(', ')}`;
      if (sync.warnings.length) detail += ` (${sync.warnings.join('; ')})`;
    }

    results.push({ row: rowNo, name, status: 'CREATED', detail });
  }

  await recalcSchoolFees(school.id);

  const summary = {
    created: results.filter((r) => r.status === 'CREATED').length,
    skipped: results.filter((r) => r.status === 'SKIPPED').length,
    failed: results.filter((r) => r.status === 'ERROR').length,
    total: results.length,
  };

  await logAudit({
    userId: session.userId,
    action: 'BULK_UPLOAD',
    entityType: 'School',
    entityId: school.id,
    detail: `${summary.created} created, ${summary.skipped} skipped, ${summary.failed} failed`,
  });

  revalidatePath(schoolPath(event.slug, 'participants'));
  revalidatePath(schoolPath(event.slug));

  return { summary, rows: results };
}

// ---------------------------------------------------------------------------
// Fees & submission
// ---------------------------------------------------------------------------
export async function submitRegistration(
  _prev: SchoolActionState,
  _formData: FormData,
): Promise<SchoolActionState> {
  const { session, school, event } = await requireSchool();

  const count = await db.participant.count({ where: { schoolId: school.id } });
  if (count === 0) return { error: 'Add at least one participant before submitting.' };

  await recalcSchoolFees(school.id);
  await db.school.update({
    where: { id: school.id },
    data: { submittedAt: new Date(), status: school.status === 'REJECTED' ? 'PENDING' : school.status },
  });

  await logAudit({
    userId: session.userId,
    action: 'REGISTRATION_SUBMITTED',
    entityType: 'School',
    entityId: school.id,
    detail: `${count} participant(s)`,
  });

  revalidatePath(schoolPath(event.slug));
  return {
    ok: true,
    message: `Submitted ${count} participant${count === 1 ? '' : 's'} for review. You can keep editing until registration closes.`,
  };
}

/**
 * Records an online entry-fee payment. This is the integration seam for a real
 * gateway: swap the reference for the gateway's transaction id on webhook
 * confirmation and the rest of the flow is unchanged.
 */
export async function recordSchoolPayment(
  _prev: SchoolActionState,
  formData: FormData,
): Promise<SchoolActionState> {
  const { session, school, event } = await requireSchool();

  const amount = Number.parseInt(String(formData.get('amount') ?? ''), 10);
  const method = String(formData.get('method') ?? 'ONLINE');
  const reference = String(formData.get('reference') ?? '').trim();

  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Enter the amount paid.' };
  if (!reference) return { error: 'Enter the transaction / UTR reference so the organisers can reconcile it.' };

  await db.payment.create({
    data: { schoolId: school.id, amount, method, reference, recordedBy: session.userId },
  });
  await recalcSchoolFees(school.id);

  await logAudit({
    userId: session.userId,
    action: 'PAYMENT_RECORDED',
    entityType: 'School',
    entityId: school.id,
    detail: `₹${amount} via ${method} (${reference})`,
  });

  revalidatePath(schoolPath(event.slug, 'payment'));
  revalidatePath(schoolPath(event.slug));
  return { ok: true, message: `Recorded ₹${amount}. A receipt confirmation has been logged against your school.` };
}
