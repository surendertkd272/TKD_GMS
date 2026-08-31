import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import type { Role } from './constants';

const COOKIE = 'gms_session';
const MAX_AGE_SECONDS = 60 * 60 * 12; // a tournament day

function secret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters (see .env).');
  }
  return new TextEncoder().encode(raw);
}

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  schoolId: string | null;
  /**
   * The event a SCHOOL/REFEREE login belongs to; null for SUPER_ADMIN.
   * The slug is carried alongside the id purely so `homeFor()` can build a
   * redirect target synchronously — authorisation always re-derives the event
   * from the database, never from these claims.
   */
  eventId: string | null;
  eventSlug: string | null;
};

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function readSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as Role,
      schoolId: (payload.schoolId as string | null) ?? null,
      eventId: (payload.eventId as string | null) ?? null,
      eventSlug: (payload.eventSlug as string | null) ?? null,
    };
  } catch {
    return null;
  }
}
