import { describe, expect, it } from 'vitest';
import { computePoomsaeScore, rankPoomsae, validateJudgeScore, type JudgeScore } from './poomsae';

const score = (judgeId: string, total: number): JudgeScore => ({ judgeId, accuracy: 0, presentation: 0, total });

describe('computePoomsaeScore', () => {
  it('averages every score when there are fewer than 5 judges', () => {
    const result = computePoomsaeScore([score('j1', 8.5), score('j2', 9.0), score('j3', 8.0)]);
    expect(result.method).toBe('MEAN');
    expect(result.judgeCount).toBe(3);
    expect(result.finalScore).toBeCloseTo((8.5 + 9.0 + 8.0) / 3, 5);
    expect(result.dropped).toEqual({ high: null, low: null });
  });

  it('drops exactly one highest and one lowest score once there are 5 or more judges', () => {
    const result = computePoomsaeScore([score('j1', 7.0), score('j2', 9.5), score('j3', 8.0), score('j4', 8.5), score('j5', 6.0)]);
    expect(result.method).toBe('TRIMMED_MEAN');
    expect(result.dropped).toEqual({ high: 9.5, low: 6.0 });
    expect(result.counted.sort((a, b) => a - b)).toEqual([7.0, 8.0, 8.5]);
    expect(result.finalScore).toBeCloseTo((7.0 + 8.0 + 8.5) / 3, 2); // finalScore is rounded to 2dp
  });

  it('only trims one high and one low even with a 7-judge panel', () => {
    const totals = [6.0, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5];
    const result = computePoomsaeScore(totals.map((t, i) => score(`j${i}`, t)));
    expect(result.dropped).toEqual({ high: 9.5, low: 6.0 });
    expect(result.counted).toHaveLength(5);
  });

  it('returns a zero, method NONE result for no judges at all', () => {
    const result = computePoomsaeScore([]);
    expect(result).toEqual({ judgeCount: 0, counted: [], dropped: { high: null, low: null }, finalScore: 0, method: 'NONE' });
  });

  it('rounds the final score to two decimal places', () => {
    const result = computePoomsaeScore([score('j1', 8.111), score('j2', 8.222), score('j3', 8.333)]);
    expect(result.finalScore).toBe(Math.round(((8.111 + 8.222 + 8.333) / 3) * 100) / 100);
  });
});

describe('validateJudgeScore', () => {
  it('accepts scores within the WT bounds', () => {
    expect(validateJudgeScore(4.0, 6.0)).toBeNull();
    expect(validateJudgeScore(0, 0)).toBeNull();
  });

  it('rejects accuracy above 4.0', () => {
    expect(validateJudgeScore(4.1, 5.0)).toMatch(/accuracy/i);
  });

  it('rejects presentation above 6.0', () => {
    expect(validateJudgeScore(3.0, 6.1)).toMatch(/presentation/i);
  });

  it('rejects negative or non-finite values', () => {
    expect(validateJudgeScore(-0.1, 5.0)).toMatch(/accuracy/i);
    expect(validateJudgeScore(3.0, Number.NaN)).toMatch(/presentation/i);
  });
});

describe('rankPoomsae', () => {
  it('ranks strictly descending by score', () => {
    const ranked = rankPoomsae([
      { entryId: 'a', finalScore: 8.5 },
      { entryId: 'b', finalScore: 9.2 },
      { entryId: 'c', finalScore: 7.9 },
    ]);
    expect(ranked.map((r) => r.entryId)).toEqual(['b', 'a', 'c']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('gives tied scores the same rank and skips the next rank (standard competition ranking)', () => {
    const ranked = rankPoomsae([
      { entryId: 'a', finalScore: 9.0 },
      { entryId: 'b', finalScore: 9.0 },
      { entryId: 'c', finalScore: 8.0 },
    ]);
    expect(ranked.find((r) => r.entryId === 'a')!.rank).toBe(1);
    expect(ranked.find((r) => r.entryId === 'b')!.rank).toBe(1);
    expect(ranked.find((r) => r.entryId === 'c')!.rank).toBe(3);
  });

  it('excludes entries with no score', () => {
    const ranked = rankPoomsae([
      { entryId: 'a', finalScore: 9.0 },
      { entryId: 'b', finalScore: null },
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.entryId).toBe('a');
  });
});
