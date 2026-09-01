import 'server-only';
import nodemailer from 'nodemailer';
import { db } from './db';

export type Attachment = { filename: string; content: Buffer; contentType?: string };

export type MailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Attachment[];
  /** Scopes the outbox record to an event, so the organiser sees only theirs. */
  eventId?: string | null;
};

export type MailResult = { ok: true; transport: 'smtp' | 'file'; ref: string } | { ok: false; error: string };


function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_HOST.trim());
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

/**
 * Sends over SMTP when configured; otherwise writes a complete .eml plus its
 * attachments to ./storage/outbox so certificate dispatch is fully exercisable
 * (and reviewable) without live mail credentials.
 */
/** The outbox is the delivery log as well as the fallback, so every attempt lands here. */
async function recordOutbox(
  input: MailInput,
  channel: 'EMAIL',
  transport: string,
  delivered: boolean,
  error: string | null,
) {
  const attachments = (input.attachments ?? [])
    .map((a) => `${a.filename} (${Math.round(a.content.byteLength / 1024)} KB)`)
    .join(', ');

  return db.outboxMessage.create({
    data: {
      eventId: input.eventId ?? null,
      channel,
      recipient: input.to,
      subject: input.subject,
      body: input.text,
      attachments: attachments || null,
      transport,
      delivered,
      error,
    },
  });
}

export async function sendMail(input: MailInput): Promise<MailResult> {
  const from = process.env.MAIL_FROM || 'no-reply@localhost';

  if (smtpConfigured()) {
    try {
      const info = await getTransporter().sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
      await recordOutbox(input, 'EMAIL', 'smtp', true, null);
      return { ok: true, transport: 'smtp', ref: info.messageId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SMTP send failed.';
      await recordOutbox(input, 'EMAIL', 'smtp', false, message);
      return { ok: false, error: message };
    }
  }

  // No SMTP configured: record the message so the organiser can see exactly what
  // would have gone out. Writing it to ./storage/outbox used to be the fallback,
  // which is impossible on a read-only serverless filesystem.
  try {
    const row = await recordOutbox(input, 'EMAIL', 'recorded', false, null);
    return { ok: true, transport: 'file', ref: row.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not record the message.' };
  }
}

export function mailModeLabel(): string {
  return smtpConfigured()
    ? `SMTP (${process.env.SMTP_HOST})`
    : 'Not configured — messages are recorded, not delivered';
}
