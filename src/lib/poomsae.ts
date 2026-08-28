/**
 * Poomsae scoring per WT competition rules: accuracy out of 4.0 + presentation
 * out of 6.0 = 10.0 per judge. With 5 or more judges the highest and lowest
 * totals are discarded and the remainder averaged; with fewer, all scores count.
 */

export type JudgeScore = { judgeId: string; accuracy: number; presentation: number; total: number };

export type PoomsaeComputation = {
  judgeCount: number;
  counted: number[];
  dropped: { high: number | null; low: number | null };
  finalScore: number;
  method: 'TRIMMED_MEAN' | 'MEAN' | 'NONE';
};

export const MAX_ACCURACY = 4.0;
export const MAX_PRESENTATION = 6.0;

export function computePoomsaeScore(scores: JudgeScore[]): PoomsaeComputation {
  const totals = scores.map((s) => s.total).sort((a, b) => a - b);

  if (totals.length === 0) {
    return { judgeCount: 0, counted: [], dropped: { high: null, low: null }, finalScore: 0, method: 'NONE' };
  }

  if (totals.length < 5) {
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    return {
      judgeCount: totals.length,
      counted: totals,
      dropped: { high: null, low: null },
      finalScore: round2(mean),
      method: 'MEAN',
    };
  }

  const low = totals[0]!;
  const high = totals[totals.length - 1]!;
  const counted = totals.slice(1, -1);
  const mean = counted.reduce((a, b) => a + b, 0) / counted.length;

  return {
    judgeCount: totals.length,
    counted,
    dropped: { high, low },
    finalScore: round2(mean),
    method: 'TRIMMED_MEAN',
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function validateJudgeScore(accuracy: number, presentation: number): string | null {
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > MAX_ACCURACY) {
    return `Accuracy must be between 0 and ${MAX_ACCURACY.toFixed(1)}.`;
  }
  if (!Number.isFinite(presentation) || presentation < 0 || presentation > MAX_PRESENTATION) {
    return `Presentation must be between 0 and ${MAX_PRESENTATION.toFixed(1)}.`;
  }
  return null;
}

export type RankableEntry = { entryId: string; finalScore: number | null };

/**
 * Dense-competition ranking: equal scores share a rank and the next rank skips
 * accordingly (1, 2, 2, 4) so medal allocation stays correct on a tie.
 */
export function rankPoomsae(entries: RankableEntry[]): { entryId: string; rank: number; finalScore: number }[] {
  const scored = entries
    .filter((e) => e.finalScore != null)
    .map((e) => ({ entryId: e.entryId, finalScore: e.finalScore! }))
    .sort((a, b) => b.finalScore - a.finalScore);

  const ranked: { entryId: string; rank: number; finalScore: number }[] = [];
  let lastScore: number | null = null;
  let lastRank = 0;

  scored.forEach((entry, idx) => {
    const rank = lastScore != null && entry.finalScore === lastScore ? lastRank : idx + 1;
    ranked.push({ ...entry, rank });
    lastScore = entry.finalScore;
    lastRank = rank;
  });

  return ranked;
}
