import 'server-only';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { db } from './db';
import { readSession, type SessionPayload } from './session';
import type { Role } from './constants';

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** Landing route per role — used after login and by guards. */
export function homeFor(role: Role): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return '/admin';
    case 'SCHOOL':
      return '/school';
    case 'REFEREE':
      return '/mat';
  }
}

export async function currentUser(): Promise<SessionPayload | null> {
  return readSession();
}

/** Require a signed-in user with one of `roles`; redirects otherwise. */
export async function requireRole<R extends Role>(...roles: R[]): Promise<SessionPayload & { role: R }> {
  const session = await readSession();
  if (!session) redirect('/login');
  if (!roles.includes(session.role as R)) redirect(homeFor(session.role));

  // Confirm the account is still active — a revoked login must not survive on a
  // cookie that has not expired yet.
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { active: true },
  });
  if (!user?.active) redirect('/login?error=disabled');

  return session as SessionPayload & { role: R };
}

export async function requireSchool() {
  const session = await requireRole('SCHOOL');
  if (!session.schoolId) redirect('/login?error=no-school');

  const school = await db.school.findUnique({ where: { id: session.schoolId } });
  if (!school) redirect('/login?error=no-school');

  return { session, school };
}

export async function requireAdmin() {
  return requireRole('SUPER_ADMIN');
}

export async function requireReferee() {
  const session = await requireRole('REFEREE');
  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { assignedMat: true },
  });
  if (!user) redirect('/login');
  return { session, user };
}

export async function logAudit(input: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  detail?: string | null;
}) {
  await db.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      detail: input.detail ?? null,
    },
  });
}
