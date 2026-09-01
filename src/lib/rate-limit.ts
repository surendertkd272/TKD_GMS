import 'server-only';
import { headers } from 'next/headers';
import { db } from './db';

/**
 * Throttles password guessing on the two login forms.
 *
 * One Super Admin account controls every event on the platform and its address
 * is guessable from the event's own pages, so unlimited attempts were the one
 * unguarded door in an otherwise sound login — bcrypt hashing, no account
 * enumeration, an active check on every request.
 *
 * Both the account and the caller's address are limited: the first stops an
 * attacker grinding one known email, the second stops them spreading attempts
 * across many. Failures are counted, successes clear the account's count.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

export type RateLimitVerdict = { allowed: true } | { allowed: false; retryAfterMinutes: number };

function windowStart(): Date {
  return new Date(Date.now() - WINDOW_MINUTES * 60_000);
}

/** Best-effort client address; behind Vercel this is the x-forwarded-for chain. */
async function callerAddress(): Promise<string | null> {
  try {
    const header = await headers();
    const forwarded = header.get('x-forwarded-for');
    const address = forwarded?.split(',')[0]?.trim() || header.get('x-real-ip');
    return address || null;
  } catch {
    return null;
  }
}

async function identifiers(email: string): Promise<string[]> {
  const address = await callerAddress();
  return [`email:${email.toLowerCase()}`, ...(address ? [`ip:${address}`] : [])];
}

/**
 * Call before checking a password. When it refuses, do not verify the password
 * at all — the point is to make each additional guess cost time.
 */
export async function checkLoginAllowed(email: string): Promise<RateLimitVerdict> {
  const since = windowStart();
  const keys = await identifiers(email);

  // Pruning here keeps the table bounded without a scheduled job.
  await db.loginAttempt.deleteMany({ where: { createdAt: { lt: since } } }).catch(() => {});

  const recent = await db.loginAttempt.findMany({
    where: { identifier: { in: keys }, createdAt: { gte: since } },
    select: { identifier: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  for (const key of keys) {
    const forKey = recent.filter((r) => r.identifier === key);
    if (forKey.length >= MAX_ATTEMPTS) {
      const oldest = forKey[0]!.createdAt.getTime();
      const freeAt = oldest + WINDOW_MINUTES * 60_000;
      return {
        allowed: false,
        retryAfterMinutes: Math.max(1, Math.ceil((freeAt - Date.now()) / 60_000)),
      };
    }
  }

  return { allowed: true };
}

export async function recordFailedLogin(email: string): Promise<void> {
  const keys = await identifiers(email);
  await db.loginAttempt
    .createMany({ data: keys.map((identifier) => ({ identifier })) })
    .catch(() => {});
}

/**
 * Clears both counters after a correct password. The address counter goes too:
 * schools sign in from one shared connection, so leaving it set would lock a
 * whole computer room out because of one coach's typing — and a caller who has
 * just proved a valid password is not the guesser this protects against.
 */
export async function clearLoginAttempts(email: string): Promise<void> {
  const keys = await identifiers(email);
  await db.loginAttempt.deleteMany({ where: { identifier: { in: keys } } }).catch(() => {});
}

export function throttledMessage(minutes: number): string {
  return `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}
