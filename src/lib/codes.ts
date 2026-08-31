import 'server-only';
import { db } from './db';

/** Prefixes used by the original single-event data — a new event must not reuse them. */
const LEGACY_CODE_STEMS = ['TKD', 'PRS'];

/** "Spring Open 2026" → "spring-open-2026", deduped against existing events. */
export async function deriveEventSlug(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'event';

  let candidate = base;
  let n = 1;
  while (await db.event.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

/**
 * "Spring Open" + "2026" → "SPR26", used to prefix participant IDs and
 * certificate numbers. Deduped against other events, and against the prefixes
 * the original single-event data already used.
 */
export async function deriveEventShortCode(name: string, edition: string): Promise<string> {
  const letters = name.replace(/[^a-zA-Z]/g, '').toUpperCase();
  const stem = (letters.slice(0, 3) || 'TKD').padEnd(3, 'X');
  const year = edition.replace(/[^0-9]/g, '').slice(-2) || '00';

  let candidate = `${stem}${year}`;
  let n = 1;
  while (
    LEGACY_CODE_STEMS.includes(candidate.slice(0, 3)) ||
    (await db.event.findUnique({ where: { shortCode: candidate }, select: { id: true } }))
  ) {
    n += 1;
    candidate = `${stem}${year}${n}`;
  }
  return candidate;
}

/**
 * Sequential human-facing codes. SQLite gives us no sequences, so we take the
 * current max suffix and retry on the unique-constraint collision that a
 * concurrent insert would cause.
 */
async function nextSequential(
  prefix: string,
  width: number,
  existing: () => Promise<string[]>,
): Promise<string> {
  const codes = await existing();
  let max = 0;
  for (const code of codes) {
    const tail = code.slice(prefix.length);
    const n = Number.parseInt(tail, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(width, '0')}`;
}

/**
 * Participant IDs and certificate numbers are prefixed with the event's own
 * `shortCode` (unique platform-wide), so these stay collision-free across events
 * without needing an eventId column on Participant/Certificate.
 */
export async function nextParticipantCode(shortCode: string): Promise<string> {
  const prefix = `${shortCode}-`;
  return nextSequential(prefix, 4, async () => {
    const rows = await db.participant.findMany({
      where: { code: { startsWith: prefix } },
      select: { code: true },
    });
    return rows.map((r) => r.code);
  });
}

export async function nextCertificateNo(
  shortCode: string,
  type: 'PARTICIPATION' | 'WINNER',
): Promise<string> {
  const prefix = `${shortCode}-${type === 'WINNER' ? 'W' : 'P'}-`;
  return nextSequential(prefix, 6, async () => {
    const rows = await db.certificate.findMany({
      where: { certNo: { startsWith: prefix } },
      select: { certNo: true },
    });
    return rows.map((r) => r.certNo);
  });
}

/** School short code from its name: "Greenwood High School" → "GHS", deduped within the event. */
export async function deriveSchoolCode(eventId: string, name: string): Promise<string> {
  const words = name
    .replace(/[^a-zA-Z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^(the|of|and|for|school|public|senior|secondary|high)$/i.test(w));

  let base = (words.length ? words : name.split(/\s+/))
    .slice(0, 4)
    .map((w) => w[0]!.toUpperCase())
    .join('');

  if (base.length < 2) base = name.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'SCH';

  let candidate = base;
  let n = 1;
  while (
    await db.school.findUnique({
      where: { eventId_code: { eventId, code: candidate } },
      select: { id: true },
    })
  ) {
    n += 1;
    candidate = `${base}${n}`;
  }
  return candidate;
}

export function categoryCode(input: {
  discipline: string;
  ageCategory: string;
  gender: string;
  weightLabel?: string | null;
  poomsaeType?: string | null;
}): string {
  const parts = [
    input.discipline === 'KYORUGI' ? 'KYO' : 'POO',
    input.ageCategory.slice(0, 3),
    input.gender === 'MALE' ? 'M' : input.gender === 'FEMALE' ? 'F' : 'X',
  ];
  if (input.discipline === 'KYORUGI' && input.weightLabel) {
    parts.push(input.weightLabel.replace(/[^0-9+]/g, '') || 'OPEN');
  } else if (input.poomsaeType) {
    parts.push(input.poomsaeType.slice(0, 4));
  }
  return parts.join('-').toUpperCase();
}
