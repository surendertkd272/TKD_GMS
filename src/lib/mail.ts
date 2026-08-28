import 'server-only';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';

export type Attachment = { filename: string; content: Buffer; contentType?: string };

export type MailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Attachment[];
};

export type MailResult = { ok: true; transport: 'smtp' | 'file'; ref: string } | { ok: false; error: string };

const OUTBOX = path.join(process.cwd(), 'storage', 'outbox');

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
      return { ok: true, transport: 'smtp', ref: info.messageId };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'SMTP send failed.' };
    }
  }

  try {
    await mkdir(OUTBOX, { recursive: true });
    // Deterministic-ish, collision-resistant name without leaking a timestamp API
    // into the hot path more than once.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const slug = input.to.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
    const base = `${stamp}__${slug}`;

    const composer = nodemailer.createTransport({ jsonTransport: true });
    const built = await composer.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });

    const header = [
      `From: ${from}`,
      `To: ${input.to}`,
      `Subject: ${input.subject}`,
      `Date: ${new Date().toUTCString()}`,
      `X-GMS-Transport: file-outbox`,
      '',
      input.text,
      '',
      `--- attachments (${input.attachments?.length ?? 0}) ---`,
      ...(input.attachments ?? []).map((a) => `${a.filename} (${a.content.byteLength} bytes)`),
      '',
      `--- raw ---`,
      typeof built.message === 'string' ? built.message : JSON.stringify(built.message),
    ].join('\n');

    await writeFile(path.join(OUTBOX, `${base}.eml`), header, 'utf8');

    for (const attachment of input.attachments ?? []) {
      await writeFile(path.join(OUTBOX, `${base}__${attachment.filename}`), attachment.content);
    }

    return { ok: true, transport: 'file', ref: `${base}.eml` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not write to the outbox.' };
  }
}

export function mailModeLabel(): string {
  return smtpConfigured() ? `SMTP (${process.env.SMTP_HOST})` : 'Local file outbox (./storage/outbox)';
}
