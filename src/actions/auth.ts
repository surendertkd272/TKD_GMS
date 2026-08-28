'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db, getSettings } from '@/lib/db';
import { hashPassword, homeFor, logAudit, verifyPassword } from '@/lib/auth';
import { createSession, destroySession } from '@/lib/session';
import { deriveSchoolCode } from '@/lib/codes';
import type { Role } from '@/lib/constants';

export type AuthState = { error?: string; message?: string } | null;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    include: { school: { select: { status: true, name: true } } },
  });

  // Same message for unknown email and wrong password — no account enumeration.
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: 'Email or password is incorrect.' };
  }
  if (!user.active) return { error: 'This account has been disabled. Contact the organising team.' };

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    schoolId: user.schoolId,
  });

  await logAudit({ userId: user.id, action: 'LOGIN', entityType: 'User', entityId: user.id });

  redirect(homeFor(user.role as Role));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
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
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

/**
 * School self-registration. Creates the school in PENDING status plus its single
 * login, so the school can start entering participants while the organising team
 * reviews the account.
 */
export async function registerSchoolAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const settings = await getSettings();
  if (settings.registrationLocked) {
    return { error: 'Registration is closed for this edition. Contact the organising team.' };
  }

  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const input = parsed.data;

  const existing = await db.user.findUnique({ where: { email: input.contactEmail } });
  if (existing) return { error: 'An account already exists for this email. Try logging in instead.' };

  const duplicateSchool = await db.school.findFirst({
    where: { name: { equals: input.schoolName } },
  });
  if (duplicateSchool) {
    return {
      error: `"${input.schoolName}" is already registered. If this is your school, ask the organising team to reset your login.`,
    };
  }

  const code = await deriveSchoolCode(input.schoolName);

  const school = await db.school.create({
    data: {
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
      email: input.contactEmail,
      passwordHash: await hashPassword(input.password),
      name: input.coachName,
      role: 'SCHOOL',
      schoolId: school.id,
    },
  });

  await logAudit({
    userId: user.id,
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
  });

  redirect('/school?welcome=1');
}
