'use server';

import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { hashPassword, logAudit } from '@/lib/auth';
import { sendMail } from '@/lib/mail';
import { MIN_PASSWORD_LENGTH } from '@/lib/constants';
import { eventLoginPath } from '@/lib/paths';

export type ResetState = { ok?: boolean; error?: string; message?: string } | null;

const TOKEN_TTL_MINUTES = 60;

/** Only the hash is stored, so the database never holds a usable link. */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Starts a reset. Always reports success: telling an anonymous caller whether an
 * address exists would undo the account enumeration the login screen avoids.
 */
export async function requestPasswordReset(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = z
    .object({
      email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
      eventId: z.string().min(1),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const confirmation = {
    ok: true as const,
    message:
      'If that email has an account for this event, a reset link is on its way. It expires in an hour.',
  };

  const event = await db.event.findUnique({ where: { id: parsed.data.eventId } });
  if (!event) return confirmation;

  const user = await db.user.findFirst({
    where: { email: parsed.data.email, eventId: event.id, active: true },
  });
  if (!user) return confirmation;

  const token = randomBytes(32).toString('base64url');
  await db.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000),
    },
  });

  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, '') ?? '';
  const link = `${base}${eventLoginPath(event.slug).replace('/login', '')}/reset-password?token=${token}`;

  await sendMail({
    eventId: event.id,
    to: user.email,
    subject: `Reset your ${event.eventName} password`,
    text: [
      `Hello ${user.name},`,
      '',
      `Someone asked to reset the password for your ${event.eventName} ${event.edition} account.`,
      'If that was you, open the link below within the next hour:',
      '',
      link,
      '',
      'If it was not you, ignore this email — nothing has changed.',
    ].join('\n'),
  });

  await logAudit({
    userId: user.id,
    eventId: event.id,
    action: 'PASSWORD_RESET_REQUESTED',
    entityType: 'User',
    entityId: user.id,
  });

  return confirmation;
}

const completeSchema = z
  .object({
    token: z.string().min(1, 'This reset link is incomplete.'),
    password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'The passwords do not match.',
    path: ['confirmPassword'],
  });

/** Consumes the token and sets the new password. */
export async function completePasswordReset(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = completeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const reset = await db.passwordReset.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
    include: { user: { include: { event: { select: { slug: true } } } } },
  });

  const expired = !reset || reset.usedAt !== null || reset.expiresAt < new Date();
  if (expired) {
    return { error: 'That reset link has expired or was already used. Request a new one.' };
  }

  await db.$transaction(async (tx) => {
    // Marking used inside the transaction keeps a double-submit from setting
    // two different passwords.
    await tx.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
    await tx.user.update({
      where: { id: reset.userId },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    });
    // Any other outstanding link for this account is void now.
    await tx.passwordReset.updateMany({
      where: { userId: reset.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  });

  await logAudit({
    userId: reset.userId,
    eventId: reset.user.eventId,
    action: 'PASSWORD_RESET_COMPLETED',
    entityType: 'User',
    entityId: reset.userId,
  });

  const slug = reset.user.event?.slug;
  redirect(slug ? `${eventLoginPath(slug)}?reset=1` : '/');
}
