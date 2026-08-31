'use server';

import { z } from 'zod';
import { db } from '@/lib/db';
import { currentUser, hashPassword, logAudit, verifyPassword } from '@/lib/auth';
import { DEFAULT_ADMIN_PASSWORD } from '@/lib/account';
import { MIN_PASSWORD_LENGTH } from '@/lib/constants';

export type AccountState = { ok?: boolean; error?: string; message?: string } | null;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH, `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'The new passwords do not match.',
    path: ['confirmPassword'],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'The new password must be different from the current one.',
    path: ['newPassword'],
  })
  .refine((v) => v.newPassword !== DEFAULT_ADMIN_PASSWORD, {
    message: 'That is the seeded default password. Choose a different one.',
    path: ['newPassword'],
  });

/**
 * Changes the signed-in user's own password. Works for every role — the account
 * comes from the session, so one user can never target another's login.
 */
export async function changePasswordAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const session = await currentUser();
  if (!session) return { error: 'Your session has expired. Sign in again.' };

  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.active) return { error: 'This account is no longer active.' };

  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return { error: 'Your current password is incorrect.' };
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });

  await logAudit({
    userId: user.id,
    eventId: user.eventId,
    action: 'PASSWORD_CHANGED',
    entityType: 'User',
    entityId: user.id,
  });

  return { ok: true, message: 'Password updated. Use it the next time you sign in.' };
}
