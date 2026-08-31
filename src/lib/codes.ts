import 'server-only';
import { db } from './db';

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

export async function nextParticipantCode(edition: string): Promise<string> {
  const prefix = `TKD${edition.slice(-2)}-`;
  return nextSequential(prefix, 4, async () => {
    const rows = await db.participant.findMany({
      where: { code: { startsWith: prefix } },
      select: { code: true },
    });
    return rows.map((r) => r.code);
  });
}

export async function nextCertificateNo(edition: string, type: 'PARTICIPATION' | 'WINNER'): Promise<string> {
  const prefix = `PRS${edition.slice(-2)}-${type === 'WINNER' ? 'W' : 'P'}-`;
  return nextSequential(prefix, 6, async () => {
    const rows = await db.certificate.findMany({
      where: { certNo: { startsWith: prefix } },
      select: { certNo: true },
    });
    return rows.map((r) => r.certNo);
  });
}

/** School short code from its name: "Greenwood High School" → "GHS", deduped. */
export async function deriveSchoolCode(name: string): Promise<string> {
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
  while (await db.school.findUnique({ where: { code: candidate }, select: { id: true } })) {
    n += 1;
    candidate = `${base}${n}`;
  }
  return candidate;
}

export function categoryCode(input: {
  event: string;
  ageCategory: string;
  gender: string;
  weightLabel?: string | null;
  poomsaeType?: string | null;
}): string {
  const parts = [
    input.event === 'KYORUGI' ? 'KYO' : 'POO',
    input.ageCategory.slice(0, 3),
    input.gender === 'MALE' ? 'M' : input.gender === 'FEMALE' ? 'F' : 'X',
  ];
  if (input.event === 'KYORUGI' && input.weightLabel) {
    parts.push(input.weightLabel.replace(/[^0-9+]/g, '') || 'OPEN');
  } else if (input.poomsaeType) {
    parts.push(input.poomsaeType.slice(0, 4));
  }
  return parts.join('-').toUpperCase();
}
