import { beforeEach, describe, expect, it, vi } from 'vitest';

// The limiter reads the caller address from next/headers; stub it so the tests
// exercise both the account key and the address key.
let forwardedFor: string | null = '203.0.113.7';
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (n: string) => (n === 'x-forwarded-for' ? forwardedFor : null) }),
}));

const { db } = await import('./db');
const { checkLoginAllowed, clearLoginAttempts, recordFailedLogin } = await import('./rate-limit');

const EMAIL = 'coach@example.test';

beforeEach(async () => {
  await db.loginAttempt.deleteMany({});
  forwardedFor = '203.0.113.7';
});

describe('login rate limiting', () => {
  it('allows a fresh account', async () => {
    expect(await checkLoginAllowed(EMAIL)).toEqual({ allowed: true });
  });

  it('allows four failures and refuses the fifth', async () => {
    for (let i = 0; i < 4; i++) await recordFailedLogin(EMAIL);
    expect(await checkLoginAllowed(EMAIL)).toEqual({ allowed: true });

    await recordFailedLogin(EMAIL);
    const verdict = await checkLoginAllowed(EMAIL);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.retryAfterMinutes).toBeGreaterThan(0);
  });

  it('clears the account counter after a correct password', async () => {
    for (let i = 0; i < 5; i++) await recordFailedLogin(EMAIL);
    expect((await checkLoginAllowed(EMAIL)).allowed).toBe(false);

    await clearLoginAttempts(EMAIL);
    expect((await checkLoginAllowed(EMAIL)).allowed).toBe(true);
  });

  it('also limits one address spreading guesses across accounts', async () => {
    for (let i = 0; i < 5; i++) await recordFailedLogin(`victim${i}@example.test`);

    // A sixth, previously untried account from the same address is still refused.
    expect((await checkLoginAllowed('someone-else@example.test')).allowed).toBe(false);
  });

  it('does not limit a different address', async () => {
    for (let i = 0; i < 5; i++) await recordFailedLogin(`victim${i}@example.test`);
    forwardedFor = '198.51.100.4';
    expect((await checkLoginAllowed('someone-else@example.test')).allowed).toBe(true);
  });

  it('ignores attempts older than the window', async () => {
    for (let i = 0; i < 5; i++) await recordFailedLogin(EMAIL);
    await db.loginAttempt.updateMany({
      data: { createdAt: new Date(Date.now() - 16 * 60_000) },
    });
    expect((await checkLoginAllowed(EMAIL)).allowed).toBe(true);
  });

  it('prunes rows outside the window', async () => {
    await recordFailedLogin(EMAIL);
    await db.loginAttempt.updateMany({ data: { createdAt: new Date(Date.now() - 60 * 60_000) } });
    await checkLoginAllowed(EMAIL);
    expect(await db.loginAttempt.count()).toBe(0);
  });

  it('still limits the account when no address header is present', async () => {
    forwardedFor = null;
    for (let i = 0; i < 5; i++) await recordFailedLogin(EMAIL);
    expect((await checkLoginAllowed(EMAIL)).allowed).toBe(false);
  });
});
