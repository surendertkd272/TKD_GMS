import 'server-only';
import { db } from './db';
import { rankSchools, type MedalResultRow, type MedalRow } from './medal-ranking';

export type { MedalRow, MedalResultRow };

export type TallyFilter = {
  discipline?: 'KYORUGI' | 'POOMSAE';
  ageCategory?: string;
  gender?: string;
};

type PointsConfig = { pointsGold: number; pointsSilver: number; pointsBronze: number };

/**
 * Live tally derived from Result rows — nothing is ever tallied by hand, so the
 * board cannot drift from the bouts that produced it. Scoped to one event.
 */
export async function medalTally(
  eventId: string,
  points: PointsConfig,
  filter: TallyFilter = {},
): Promise<{ rows: MedalRow[]; totals: Omit<MedalRow, 'schoolId' | 'schoolCode' | 'schoolName' | 'rank'> }> {
  const results = await db.result.findMany({
    where: {
      medal: { not: null },
      category: {
        eventId,
        ...(filter.discipline ? { discipline: filter.discipline } : {}),
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

  return rankSchools(medalRows, points);
}

/** Leader by weighted points — the "Champion School" award. */
export async function championSchool(eventId: string, points: PointsConfig): Promise<MedalRow | null> {
  const { rows } = await medalTally(eventId, points);
  if (!rows.length) return null;
  return [...rows].sort((a, b) => b.points - a.points || b.gold - a.gold)[0]!;
}

export async function eventStats(eventId: string) {
  const bySchool = { school: { eventId } };
  const byCategory = { category: { eventId } };

  const [schools, approvedSchools, participants, approvedParticipants, categories, bouts, completedBouts, medals, certificates, payments] =
    await Promise.all([
      db.school.count({ where: { eventId } }),
      db.school.count({ where: { eventId, status: 'APPROVED' } }),
      db.participant.count({ where: bySchool }),
      db.participant.count({ where: { ...bySchool, status: 'APPROVED' } }),
      db.category.count({ where: { eventId, active: true } }),
      db.bout.count({ where: { ...byCategory, status: { not: 'BYE' } } }),
      db.bout.count({ where: { ...byCategory, status: 'COMPLETED' } }),
      db.result.count({ where: { ...byCategory, medal: { not: null } } }),
      db.certificate.count({ where: { participant: bySchool } }),
      db.payment.aggregate({ _sum: { amount: true }, where: { school: { eventId } } }),
    ]);

  const athletes = await db.participant.count({ where: { ...bySchool, personRole: 'ATHLETE' } });

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
