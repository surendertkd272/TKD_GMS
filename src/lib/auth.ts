import 'server-only';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { db } from './db';
import { readSession, type SessionPayload } from './session';
import { ADMIN_EVENTS, ADMIN_LOGIN, HOME, matPath, schoolPath } from './paths';
import type { Role } from './constants';

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/**
 * Landing route for a signed-in user. Stays synchronous (it's called from
 * `requireRole` and from render paths) by reading the event slug carried in the
 * session rather than hitting the database.
 */
export function homeFor(session: Pick<SessionPayload, 'role' | 'eventSlug'>): string {
  switch (session.role) {
    case 'SUPER_ADMIN':
      return ADMIN_EVENTS;
    case 'SCHOOL':
      return session.eventSlug ? schoolPath(session.eventSlug) : HOME;
    case 'REFEREE':
      return session.eventSlug ? matPath(session.eventSlug) : HOME;
  }
}

/** Where to send someone who needs to sign in, given the event they were headed for. */
export function loginPathFor(eventSlug?: string | null): string {
  return eventSlug ? `/events/${eventSlug}/login` : ADMIN_LOGIN;
}

export async function currentUser(): Promise<SessionPayload | null> {
  return readSession();
}

/** Require a signed-in user with one of `roles`; redirects otherwise. */
export async function requireRole<R extends Role>(...roles: R[]): Promise<SessionPayload & { role: R }> {
  const session = await readSession();
  if (!session) redirect(loginPathFor());
  if (!roles.includes(session.role as R)) redirect(homeFor(session));

  // Confirm the account is still active — a revoked login must not survive on a
  // cookie that has not expired yet.
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { active: true },
  });
  if (!user?.active) redirect(`${loginPathFor(session.eventSlug)}?error=disabled`);

  return session as SessionPayload & { role: R };
}

export async function requireAdmin() {
  const session = await readSession();
  if (!session) redirect(ADMIN_LOGIN);
  if (session.role !== 'SUPER_ADMIN') redirect(homeFor(session));

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { active: true } });
  if (!user?.active) redirect(`${ADMIN_LOGIN}?error=disabled`);

  return session as SessionPayload & { role: 'SUPER_ADMIN' };
}

/**
 * A school login, together with the event it belongs to. The event is derived
 * from the School row itself — never from the URL or the session claim — so a
 * school can't reach another event's data by editing the slug.
 */
export async function requireSchool() {
  const session = await requireRole('SCHOOL');
  if (!session.schoolId) redirect(`${loginPathFor(session.eventSlug)}?error=no-school`);

  const school = await db.school.findUnique({
    where: { id: session.schoolId },
    include: { event: true },
  });
  if (!school) redirect(`${loginPathFor(session.eventSlug)}?error=no-school`);

  return { session, school, event: school.event };
}

export async function requireReferee() {
  const session = await requireRole('REFEREE');
  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { assignedMat: true, event: true },
  });
  if (!user) redirect(loginPathFor(session.eventSlug));
  if (!user.event) redirect(`${loginPathFor(session.eventSlug)}?error=no-event`);

  return { session, user, event: user.event };
}

export async function logAudit(input: {
  userId?: string | null;
  eventId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  detail?: string | null;
}) {
  await db.auditLog.create({
    data: {
      userId: input.userId ?? null,
      eventId: input.eventId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      detail: input.detail ?? null,
    },
  });
}
