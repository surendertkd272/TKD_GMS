import 'server-only';
import { db, getSettings } from './db';
import { rankSchools, type MedalResultRow, type MedalRow } from './medal-ranking';

export type { MedalRow, MedalResultRow };

export type TallyFilter = {
  event?: 'KYORUGI' | 'POOMSAE';
  ageCategory?: string;
  gender?: string;
};

/**
 * Live tally derived from Result rows — nothing is ever tallied by hand, so the
 * board cannot drift from the bouts that produced it.
 */
export async function medalTally(filter: TallyFilter = {}): Promise<{ rows: MedalRow[]; totals: Omit<MedalRow, 'schoolId' | 'schoolCode' | 'schoolName' | 'rank'> }> {
  const settings = await getSettings();

  const results = await db.result.findMany({
    where: {
      medal: { not: null },
      category: {
        ...(filter.event ? { event: filter.event } : {}),
        ...(filter.ageCategory ? { ageCategory: filter.ageCategory } : {}),
        ...(filter.gender ? { gender: filter.gender } : {}),
      },
    },
    include: {
      entry: { include: { participant: { include: { school: { select: { id: true, code: true, name: true } } } } } },
    },
  });

  const medalRows: MedalResultRow[] = results.map((result) => ({
    schoolId: result.entry.participant.school.id,
    schoolCode: result.entry.participant.school.code,
    schoolName: result.entry.participant.school.name,
    medal: result.medal as 'GOLD' | 'SILVER' | 'BRONZE',
  }));

  return rankSchools(medalRows, settings);
}

/** Leader by weighted points — the "Champion School" award. */
export async function championSchool(): Promise<MedalRow | null> {
  const { rows } = await medalTally();
  if (!rows.length) return null;
  return [...rows].sort((a, b) => b.points - a.points || b.gold - a.gold)[0]!;
}

export async function eventStats() {
  const [schools, approvedSchools, participants, approvedParticipants, categories, bouts, completedBouts, medals, certificates, payments] =
    await Promise.all([
      db.school.count(),
      db.school.count({ where: { status: 'APPROVED' } }),
      db.participant.count(),
      db.participant.count({ where: { status: 'APPROVED' } }),
      db.category.count({ where: { active: true } }),
      db.bout.count({ where: { status: { not: 'BYE' } } }),
      db.bout.count({ where: { status: 'COMPLETED' } }),
      db.result.count({ where: { medal: { not: null } } }),
      db.certificate.count(),
      db.payment.aggregate({ _sum: { amount: true } }),
    ]);

  const athletes = await db.participant.count({ where: { personRole: 'ATHLETE' } });

  return {
    schools,
    approvedSchools,
    participants,
    approvedParticipants,
    athletes,
    categories,
    bouts,
    completedBouts,
    medals,
    certificates,
    revenue: payments._sum.amount ?? 0,
  };
}
