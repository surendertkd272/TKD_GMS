import 'server-only';
import { db } from './db';

/** Column order of the bulk-upload CSV template and its parser aliases. */
export const CSV_TEMPLATE_HEADERS = [
  'name',
  'gender',
  'dob',
  'weight_kg',
  'belt_grade',
  'events',
  'role',
  'email',
  'phone',
  'emergency_contact_name',
  'emergency_contact_phone',
  'medical_notes',
];

export async function recalcSchoolFees(schoolId: string): Promise<void> {
  const athletes = await db.participant.count({
    where: { schoolId, personRole: 'ATHLETE', status: { not: 'REJECTED' } },
  });
  const paid = await db.payment.aggregate({ where: { schoolId }, _sum: { amount: true } });

  // The fee comes from the school's own event.
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { paymentStatus: true, event: { select: { feePerParticipant: true } } },
  });
  if (!school) return;

  const amountDue = athletes * school.event.feePerParticipant;
  const amountPaid = paid._sum.amount ?? 0;

  const paymentStatus =
    school?.paymentStatus === 'WAIVED'
      ? 'WAIVED'
      : amountPaid <= 0
        ? 'UNPAID'
        : amountPaid >= amountDue
          ? 'PAID'
          : 'PARTIAL';

  await db.school.update({ where: { id: schoolId }, data: { amountDue, amountPaid, paymentStatus } });
}

export type ReadinessKind = 'PHOTO' | 'NO_ENTRY' | 'NO_CONTACT' | 'DUPLICATE';

export type ReadinessIssue = {
  participantId: string | null;
  code: string | null;
  label: string;
  issue: string;
  kind: ReadinessKind;
};

/** One issue kind and everyone affected by it. */
export type ReadinessGroup = {
  kind: ReadinessKind;
  title: string;
  detail: string;
  people: ReadinessIssue[];
};

const GROUP_COPY: Record<ReadinessKind, { one: string; many: string; detail: string }> = {
  PHOTO: {
    one: '1 participant has no photo',
    many: '%n participants have no photo',
    detail: 'Their accreditation card will print an empty photo box.',
  },
  NO_ENTRY: {
    one: '1 athlete is in no division',
    many: '%n athletes are in no division',
    detail: 'They entered no discipline, or their weight falls outside every configured division.',
  },
  NO_CONTACT: {
    one: '1 participant has no emergency contact',
    many: '%n participants have no emergency contact',
    detail: 'A contact number is required before the squad can be submitted.',
  },
  DUPLICATE: {
    one: '1 possible duplicate',
    many: '%n possible duplicates',
    detail: 'These entries share a name and date of birth with another.',
  },
};

const GROUP_ORDER: ReadinessKind[] = ['DUPLICATE', 'NO_ENTRY', 'NO_CONTACT', 'PHOTO'];

/**
 * Collapses the flat issue list into one entry per problem. Nine identical
 * "no photo" rows tell a coach nothing that "9 participants have no photo"
 * doesn't, and they bury the one issue that differs.
 */
export function groupReadinessIssues(issues: ReadinessIssue[]): ReadinessGroup[] {
  return GROUP_ORDER.flatMap((kind) => {
    const people = issues.filter((i) => i.kind === kind);
    if (people.length === 0) return [];
    const copy = GROUP_COPY[kind];
    return [{
      kind,
      title: people.length === 1 ? copy.one : copy.many.replace('%n', String(people.length)),
      detail: copy.detail,
      people,
    }];
  });
}

/** The pre-submission check the spec asks for: duplicates and incomplete entries. */
export async function schoolReadiness(schoolId: string): Promise<{
  issues: ReadinessIssue[];
  counts: { participants: number; athletes: number; withPhoto: number; entries: number };
}> {
  const participants = await db.participant.findMany({
    where: { schoolId, status: { not: 'REJECTED' } },
    include: { entries: true },
    orderBy: { createdAt: 'asc' },
  });

  const issues: ReadinessIssue[] = [];
  const byNameDob = new Map<string, string[]>();

  for (const p of participants) {
    const key = `${p.name.trim().toLowerCase()}|${p.dob.toISOString().slice(0, 10)}`;
    byNameDob.set(key, [...(byNameDob.get(key) ?? []), p.code]);

    if (!p.photoPath) {
      issues.push({ participantId: p.id, code: p.code, label: p.name, kind: 'PHOTO', issue: 'No photo — the accreditation card will print an empty photo box.' });
    }
    if (p.personRole === 'ATHLETE' && p.entries.length === 0) {
      issues.push({ participantId: p.id, code: p.code, label: p.name, kind: 'NO_ENTRY', issue: 'Entered no division, or the weight falls outside every configured division.' });
    }
    if (!p.emergencyContactPhone) {
      issues.push({ participantId: p.id, code: p.code, label: p.name, kind: 'NO_CONTACT', issue: 'No emergency contact number.' });
    }
  }

  for (const [key, codes] of byNameDob) {
    if (codes.length > 1) {
      issues.push({
        participantId: null,
        code: codes.join(', '),
        label: key.split('|')[0]!,
        kind: 'DUPLICATE',
        issue: `Possible duplicate — ${codes.length} entries share this name and date of birth.`,
      });
    }
  }

  return {
    issues,
    counts: {
      participants: participants.length,
      athletes: participants.filter((p) => p.personRole === 'ATHLETE').length,
      withPhoto: participants.filter((p) => p.photoPath).length,
      entries: participants.reduce((sum, p) => sum + p.entries.length, 0),
    },
  };
}

