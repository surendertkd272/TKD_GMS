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

export type ReadinessIssue = { participantId: string | null; code: string | null; label: string; issue: string };

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
      issues.push({ participantId: p.id, code: p.code, label: p.name, issue: 'No photo — the accreditation card will print an empty photo box.' });
    }
    if (p.personRole === 'ATHLETE' && p.entries.length === 0) {
      issues.push({ participantId: p.id, code: p.code, label: p.name, issue: 'Entered no event, or the weight falls outside every configured division.' });
    }
    if (!p.emergencyContactPhone) {
      issues.push({ participantId: p.id, code: p.code, label: p.name, issue: 'No emergency contact number.' });
    }
  }

  for (const [key, codes] of byNameDob) {
    if (codes.length > 1) {
      issues.push({
        participantId: null,
        code: codes.join(', '),
        label: key.split('|')[0]!,
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

