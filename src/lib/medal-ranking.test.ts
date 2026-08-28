import { describe, expect, it } from 'vitest';
import { rankSchools, type MedalResultRow } from './medal-ranking';

const POINTS = { pointsGold: 5, pointsSilver: 3, pointsBronze: 1 };

function medal(schoolId: string, medal: MedalResultRow['medal'], schoolName = schoolId): MedalResultRow {
  return { schoolId, schoolCode: schoolId.toUpperCase(), schoolName, medal };
}

describe('rankSchools', () => {
  it('counts medals and computes weighted points per school', () => {
    const { rows } = rankSchools(
      [medal('a', 'GOLD'), medal('a', 'GOLD'), medal('a', 'SILVER'), medal('b', 'BRONZE')],
      POINTS,
    );

    const a = rows.find((r) => r.schoolId === 'a')!;
    expect(a.gold).toBe(2);
    expect(a.silver).toBe(1);
    expect(a.bronze).toBe(0);
    expect(a.total).toBe(3);
    expect(a.points).toBe(2 * 5 + 3);

    const b = rows.find((r) => r.schoolId === 'b')!;
    expect(b.bronze).toBe(1);
    expect(b.points).toBe(1);
  });

  it('ranks by gold, then silver, then bronze, then points, before name', () => {
    const { rows } = rankSchools(
      [
        medal('gold-school', 'GOLD'),
        medal('silver-school', 'SILVER'),
        medal('silver-school', 'SILVER'),
      ],
      POINTS,
    );

    // One gold outranks two silvers, even though two silvers is worth more raw points (6 vs 5)
    // under this points config — medal count beats points in the sort order.
    expect(rows[0]!.schoolId).toBe('gold-school');
    expect(rows[1]!.schoolId).toBe('silver-school');
  });

  it('gives schools with an identical medal line a shared (non-consecutive) rank', () => {
    const { rows } = rankSchools(
      [medal('a', 'GOLD'), medal('b', 'GOLD'), medal('c', 'SILVER')],
      POINTS,
    );

    // a and b are tied on medals — alphabetical tiebreak decides listing order, but both share rank 1.
    const [first, second, third] = rows;
    expect(first!.rank).toBe(1);
    expect(second!.rank).toBe(1);
    expect(third!.rank).toBe(3); // not 2 — standard competition ranking skips the tied slot
  });

  it('sums totals across every school', () => {
    const { totals } = rankSchools(
      [medal('a', 'GOLD'), medal('b', 'SILVER'), medal('c', 'BRONZE'), medal('c', 'BRONZE')],
      POINTS,
    );
    expect(totals).toEqual({ gold: 1, silver: 1, bronze: 2, total: 4, points: 5 + 3 + 1 + 1 });
  });

  it('returns no rows for an empty tally', () => {
    const { rows, totals } = rankSchools([], POINTS);
    expect(rows).toEqual([]);
    expect(totals).toEqual({ gold: 0, silver: 0, bronze: 0, total: 0, points: 0 });
  });
});
