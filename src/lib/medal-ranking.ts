/**
 * Pure medal-tally maths: aggregation, "Champion School" points and shared
 * ranking. No database access, so the who's-ahead logic can be reasoned about
 * (and tested) independently of how the Result rows were fetched.
 */

export type MedalRow = {
  schoolId: string;
  schoolCode: string;
  schoolName: string;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
  points: number;
  rank: number;
};

export type MedalResultRow = {
  schoolId: string;
  schoolCode: string;
  schoolName: string;
  medal: 'GOLD' | 'SILVER' | 'BRONZE';
};

export type PointsConfig = { pointsGold: number; pointsSilver: number; pointsBronze: number };

export function rankSchools(
  medalRows: MedalResultRow[],
  points: PointsConfig,
): { rows: MedalRow[]; totals: Omit<MedalRow, 'schoolId' | 'schoolCode' | 'schoolName' | 'rank'> } {
  const bySchool = new Map<string, MedalRow>();

  for (const result of medalRows) {
    const row =
      bySchool.get(result.schoolId) ??
      ({
        schoolId: result.schoolId,
        schoolCode: result.schoolCode,
        schoolName: result.schoolName,
        gold: 0,
        silver: 0,
        bronze: 0,
        total: 0,
        points: 0,
        rank: 0,
      } satisfies MedalRow);

    if (result.medal === 'GOLD') {
      row.gold++;
      row.points += points.pointsGold;
    } else if (result.medal === 'SILVER') {
      row.silver++;
      row.points += points.pointsSilver;
    } else if (result.medal === 'BRONZE') {
      row.bronze++;
      row.points += points.pointsBronze;
    }
    row.total++;
    bySchool.set(result.schoolId, row);
  }

  const rows = [...bySchool.values()].sort(
    (a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || b.points - a.points || a.schoolName.localeCompare(b.schoolName),
  );

  // Shared rank on an identical gold/silver/bronze line — standard competition
  // ranking (1, 2, 2, 4), matching how Poomsae ties are ranked.
  let lastKey = '';
  let lastRank = 0;
  rows.forEach((row, idx) => {
    const key = `${row.gold}-${row.silver}-${row.bronze}`;
    row.rank = key === lastKey ? lastRank : idx + 1;
    lastKey = key;
    lastRank = row.rank;
  });

  const totals = rows.reduce(
    (acc, r) => ({
      gold: acc.gold + r.gold,
      silver: acc.silver + r.silver,
      bronze: acc.bronze + r.bronze,
      total: acc.total + r.total,
      points: acc.points + r.points,
    }),
    { gold: 0, silver: 0, bronze: 0, total: 0, points: 0 },
  );

  return { rows, totals };
}
