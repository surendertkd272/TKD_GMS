import 'server-only';
import { db } from './db';

export type SmsChannel = 'sms' | 'whatsapp';
export type SmsInput = { to: string; body: string; channel?: SmsChannel | 'auto' 
  /** Scopes the outbox record to an event. */
  eventId?: string | null;
};
export type SmsResult = { ok: true; transport: 'twilio' | 'file'; ref: string } | { ok: false; error: string };


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
async function recordSms(
  input: SmsInput,
  to: string,
  channel: SmsChannel,
  transport: string,
  delivered: boolean,
  error: string | null,
) {
  return db.outboxMessage.create({
    data: {
      eventId: input.eventId ?? null,
      channel: channel === 'whatsapp' ? 'WHATSAPP' : 'SMS',
      recipient: to,
      body: input.body,
      transport,
      delivered,
      error,
    },
  });
}

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
      await recordSms(input, to, channel, 'twilio', true, null);
      return { ok: true, transport: 'twilio', ref: data.sid ?? 'unknown' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Twilio request failed.';
      await recordSms(input, to, channel, 'twilio', false, message);
      return { ok: false, error: message };
    }
  }

  // No Twilio configured: record it rather than writing to a filesystem the
  // serverless host will not let us write to.
  try {
    const row = await recordSms(input, to, channel, 'recorded', false, null);
    return { ok: true, transport: 'file', ref: row.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not record the message.' };
  }
}

export function smsModeLabel(): string {
  if (!twilioConfigured()) return 'Not configured — messages are recorded, not delivered';
  return process.env.TWILIO_WHATSAPP_FROM ? 'Twilio (WhatsApp)' : 'Twilio (SMS)';
}
