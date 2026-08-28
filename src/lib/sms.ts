import 'server-only';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type SmsChannel = 'sms' | 'whatsapp';
export type SmsInput = { to: string; body: string; channel?: SmsChannel | 'auto' };
export type SmsResult = { ok: true; transport: 'twilio' | 'file'; ref: string } | { ok: false; error: string };

const OUTBOX = path.join(process.cwd(), 'storage', 'outbox');

function twilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

function resolveChannel(pref: SmsChannel | 'auto'): SmsChannel {
  if (pref !== 'auto') return pref;
  return process.env.TWILIO_WHATSAPP_FROM ? 'whatsapp' : 'sms';
}

/** Bare 10-digit numbers are assumed local to the event (India) — everything else passes through. */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

/**
 * Sends over Twilio (SMS or WhatsApp) when credentials are configured; otherwise
 * writes the message to ./storage/outbox so the flow is exercisable and reviewable
 * without live credentials — same fallback shape as sendMail.
 */
export async function sendSms(input: SmsInput): Promise<SmsResult> {
  const channel = resolveChannel(input.channel ?? 'auto');
  const to = normalizePhone(input.to);
  if (!to) return { ok: false, error: 'No valid phone number on file.' };

  if (twilioConfigured()) {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const from = channel === 'whatsapp' ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_SMS_FROM;
    if (!from) return { ok: false, error: `TWILIO_${channel.toUpperCase()}_FROM is not configured.` };

    const prefix = channel === 'whatsapp' ? 'whatsapp:' : '';
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: `${prefix}${to}`, From: `${prefix}${from}`, Body: input.body }),
      });
      const data = (await res.json()) as { sid?: string; message?: string };
      if (!res.ok) return { ok: false, error: data.message ?? `Twilio request failed (${res.status}).` };
      return { ok: true, transport: 'twilio', ref: data.sid ?? 'unknown' };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Twilio request failed.' };
    }
  }

  try {
    await mkdir(OUTBOX, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const slug = to.replace(/[^a-zA-Z0-9+]/g, '_').slice(0, 40);
    const filename = `${stamp}__${channel}__${slug}.txt`;

    await writeFile(
      path.join(OUTBOX, filename),
      [`Channel: ${channel}`, `To: ${to}`, `Date: ${new Date().toUTCString()}`, '', input.body].join('\n'),
      'utf8',
    );

    return { ok: true, transport: 'file', ref: filename };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not write to the outbox.' };
  }
}

export function smsModeLabel(): string {
  if (!twilioConfigured()) return 'Local file outbox (./storage/outbox)';
  return process.env.TWILIO_WHATSAPP_FROM ? 'Twilio (WhatsApp)' : 'Twilio (SMS)';
}
