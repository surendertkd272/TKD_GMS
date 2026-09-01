'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword, homeFor, logAudit, verifyPassword } from '@/lib/auth';
import { createSession, destroySession } from '@/lib/session';
import {
  checkLoginAllowed,
  clearLoginAttempts,
  recordFailedLogin,
  throttledMessage,
} from '@/lib/rate-limit';
import { deriveSchoolCode } from '@/lib/codes';
import { ADMIN_EVENTS, ADMIN_LOGIN, HOME, schoolPath } from '@/lib/paths';
import type { Role } from '@/lib/constants';
import { MIN_PASSWORD_LENGTH } from '@/lib/constants';

export type AuthState = { error?: string; message?: string } | null;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

/** School / referee login, scoped to one event (emails are unique per event). */
export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const eventId = String(formData.get('eventId') ?? '');
  if (!eventId) return { error: 'Missing event context. Open the login page from the event again.' };

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  // Refuse before touching the password, so each further guess costs the caller
  // the wait rather than a hash comparison.
  const limit = await checkLoginAllowed(parsed.data.email);
  if (!limit.allowed) return { error: throttledMessage(limit.retryAfterMinutes) };

  const user = await db.user.findFirst({
    where: { email: parsed.data.email, eventId },
    include: { event: { select: { slug: true } } },
  });

  // Same message for unknown email and wrong password — no account enumeration.
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    await recordFailedLogin(parsed.data.email);
    return { error: 'Email or password is incorrect.' };
  }
  await clearLoginAttempts(parsed.data.email);
  if (!user.active) return { error: 'This account has been disabled. Contact the organising team.' };

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    schoolId: user.schoolId,
    eventId: user.eventId,
    eventSlug: user.event?.slug ?? null,
  });

  await logAudit({
    userId: user.id,
    eventId: user.eventId,
    action: 'LOGIN',
    entityType: 'User',
    entityId: user.id,
  });

  redirect(homeFor({ role: user.role as Role, eventSlug: user.event?.slug ?? null }));
}

/** Platform-level Super Admin login — not tied to any event. */
export async function adminLoginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const limit = await checkLoginAllowed(parsed.data.email);
  if (!limit.allowed) return { error: throttledMessage(limit.retryAfterMinutes) };

  const user = await db.user.findFirst({
    where: { email: parsed.data.email, role: 'SUPER_ADMIN' },
  });

  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    await recordFailedLogin(parsed.data.email);
    return { error: 'Email or password is incorrect.' };
  }
  await clearLoginAttempts(parsed.data.email);
  if (!user.active) return { error: 'This account has been disabled.' };

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: 'SUPER_ADMIN',
    schoolId: null,
    eventId: null,
    eventSlug: null,
  });

  await logAudit({ userId: user.id, action: 'LOGIN', entityType: 'User', entityId: user.id });

  redirect(ADMIN_EVENTS);
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect(HOME);
}

export async function adminLogoutAction(): Promise<void> {
  await destroySession();
  redirect(ADMIN_LOGIN);
}

const registerSchema = z
  .object({
    schoolName: z.string().trim().min(3, 'School name is required.'),
    boardAffiliation: z.string().trim().optional(),
    city: z.string().trim().optional(),
    state: z.string().trim().optional(),
    address: z.string().trim().optional(),
    principalName: z.string().trim().optional(),
    coachName: z.string().trim().min(2, 'Name of the coach / teacher-in-charge is required.'),
    coachPhone: z.string().trim().optional(),
    contactEmail: z.string().trim().toLowerCase().email('Enter a valid contact email.'),
    contactPhone: z.string().trim().optional(),
    password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

/**
 * School self-registration for one event. Creates the school in PENDING status
 * plus its single login, so the school can start entering participants while the
 * organising team reviews the account.
 */
export async function registerSchoolAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const eventId = String(formData.get('eventId') ?? '');
  if (!eventId) return { error: 'Missing event context. Open the registration page from the event again.' };

  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) return { error: 'That event no longer exists.' };
  if (event.registrationLocked) {
    return { error: 'Registration is closed for this event. Contact the organising team.' };
  }

  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const input = parsed.data;

  const existing = await db.user.findFirst({ where: { email: input.contactEmail, eventId } });
  if (existing) {
    return { error: 'An account already exists for this email in this event. Try logging in instead.' };
  }

  const duplicateSchool = await db.school.findFirst({
    where: { eventId, name: { equals: input.schoolName } },
  });
  if (duplicateSchool) {
    return {
      error: `"${input.schoolName}" is already registered for this event. If this is your school, ask the organising team to reset your login.`,
    };
  }

  const code = await deriveSchoolCode(eventId, input.schoolName);

  const school = await db.school.create({
    data: {
      eventId,
      code,
      name: input.schoolName,
      boardAffiliation: input.boardAffiliation || null,
      address: input.address || null,
      city: input.city || null,
      state: input.state || null,
      principalName: input.principalName || null,
      coachName: input.coachName,
      coachPhone: input.coachPhone || null,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone || null,
      status: 'PENDING',
    },
  });

  const user = await db.user.create({
    data: {
      eventId,
      email: input.contactEmail,
      passwordHash: await hashPassword(input.password),
      name: input.coachName,
      role: 'SCHOOL',
      schoolId: school.id,
    },
  });

  await logAudit({
    userId: user.id,
    eventId,
    action: 'SCHOOL_REGISTERED',
    entityType: 'School',
    entityId: school.id,
    detail: `${school.name} (${school.code}) self-registered`,
  });

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: 'SCHOOL',
    schoolId: school.id,
    eventId,
    eventSlug: event.slug,
  });

  redirect(`${schoolPath(event.slug)}?welcome=1`);
}
