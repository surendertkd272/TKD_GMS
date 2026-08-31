import 'server-only';
import { db } from './db';
import { verifyPassword } from './auth';

/**
 * The password `prisma/seed.ts` falls back to when SEED_ADMIN_PASSWORD is unset.
 * Used only to warn an admin still sitting on it — never to authenticate.
 */
export const DEFAULT_ADMIN_PASSWORD = 'Admin@123';

/** True when this user is still on the seeded default password. */
export async function isOnDefaultPassword(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) return false;
  return verifyPassword(DEFAULT_ADMIN_PASSWORD, user.passwordHash);
}
