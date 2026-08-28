import { BELT_GRADES, roundLabel } from './constants';

/**
 * Pure single-elimination bracket maths. No database access — so the pairing,
 * seeding and bye rules can be reasoned about (and tested) in isolation.
 */

export type SeedStrategy = 'BELT' | 'RANDOM';

export type DrawEntrant = {
  entryId: string;
  participantName: string;
  schoolId: string;
  beltGrade: string;
};

export type BracketSlot = { entryId: string; seed: number } | null;

export type BracketBout = {
  round: number; // 1-based
  roundLabel: string;
  position: number; // 0-based within the round
  red: BracketSlot;
  blue: BracketSlot;
  /** index into the flat bout list that the winner advances to */
  nextIndex: number | null;
  nextSlot: 'RED' | 'BLUE' | null;
  isBye: boolean;
};

export type Bracket = {
  bracketSize: number;
  entrantCount: number;
  byes: number;
  rounds: number;
  bouts: BracketBout[];
  /** entryIds seeded 1..N, index 0 = seed 1 */
  seedOrder: string[];
};

export function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return Math.max(size, 2);
}

/**
 * Standard tournament slot order: for size 8 → [1,8,4,5,2,7,3,6], so seed 1 and
 * seed 2 can only meet in the final and byes fall to the strongest seeds.
 */
export function seedSlots(size: number): number[] {
  let slots = [1, 2];
  while (slots.length < size) {
    const sum = slots.length * 2 + 1;
    const next: number[] = [];
    for (const s of slots) {
      next.push(s, sum - s);
    }
    slots = next;
  }
  return slots;
}

const beltRank = (grade: string): number => {
  const idx = BELT_GRADES.findIndex((g) => g.toLowerCase() === grade.trim().toLowerCase());
  return idx === -1 ? 0 : idx;
};

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** Strength ordering → seed 1 is the strongest entrant. */
export function orderEntrants(entrants: DrawEntrant[], strategy: SeedStrategy): DrawEntrant[] {
  if (strategy === 'RANDOM') return shuffle(entrants);

  // Belt grade descending; ties broken randomly so equal belts are not ordered
  // by insertion (which would systematically favour early-registering schools).
  return shuffle(entrants).sort((a, b) => beltRank(b.beltGrade) - beltRank(a.beltGrade));
}

/**
 * Avoid same-school first-round meetings. Walks each opening pairing and, when
 * both athletes share a school, swaps one of them with the nearest seed from a
 * different school that does not create a fresh clash.
 */
export function spreadSchools(ordered: DrawEntrant[], bracketSize: number): DrawEntrant[] {
  const slots = seedSlots(bracketSize);
  const seeds = [...ordered];
  const seedAt = (seedNo: number): DrawEntrant | undefined => seeds[seedNo - 1];

  for (let bout = 0; bout < bracketSize / 2; bout++) {
    const seedA = slots[bout * 2]!;
    const seedB = slots[bout * 2 + 1]!;
    const a = seedAt(seedA);
    const b = seedAt(seedB);
    if (!a || !b || a.schoolId !== b.schoolId) continue;

    // Find a swap partner for `b` in another opening pair.
    let swapped = false;
    for (let other = 0; other < bracketSize / 2 && !swapped; other++) {
      if (other === bout) continue;
      for (const candidateSeed of [slots[other * 2 + 1]!, slots[other * 2]!]) {
        const candidate = seedAt(candidateSeed);
        if (!candidate || candidate.schoolId === a.schoolId) continue;

        const partnerSeed = candidateSeed === slots[other * 2]! ? slots[other * 2 + 1]! : slots[other * 2]!;
        const partner = seedAt(partnerSeed);
        // Swapping must not create a same-school clash in the other pair.
        if (partner && partner.schoolId === b.schoolId) continue;

        seeds[candidateSeed - 1] = b;
        seeds[seedB - 1] = candidate;
        swapped = true;
        break;
      }
    }
  }

  return seeds;
}

export function buildBracket(entrants: DrawEntrant[], strategy: SeedStrategy = 'BELT'): Bracket {
  const entrantCount = entrants.length;
  const bracketSize = nextPowerOfTwo(entrantCount);
  const rounds = Math.log2(bracketSize);

  const ordered = spreadSchools(orderEntrants(entrants, strategy), bracketSize);
  const slots = seedSlots(bracketSize);

  const bouts: BracketBout[] = [];
  const roundStart: number[] = []; // flat index where each round begins

  for (let round = 1; round <= rounds; round++) {
    const boutsInRound = bracketSize / 2 ** round;
    roundStart[round] = bouts.length;

    for (let position = 0; position < boutsInRound; position++) {
      let red: BracketSlot = null;
      let blue: BracketSlot = null;

      if (round === 1) {
        const seedA = slots[position * 2]!;
        const seedB = slots[position * 2 + 1]!;
        const a = ordered[seedA - 1];
        const b = ordered[seedB - 1];
        // Higher seed always takes the red corner.
        if (a) red = { entryId: a.entryId, seed: seedA };
        if (b) blue = { entryId: b.entryId, seed: seedB };
        if (!red && blue) {
          red = blue;
          blue = null;
        }
      }

      bouts.push({
        round,
        roundLabel: roundLabel(boutsInRound),
        position,
        red,
        blue,
        nextIndex: null,
        nextSlot: null,
        isBye: false,
      });
    }
  }

  // Wire winners forward: bout `p` of round r feeds slot (p % 2) of bout floor(p/2).
  for (let round = 1; round < rounds; round++) {
    const boutsInRound = bracketSize / 2 ** round;
    for (let position = 0; position < boutsInRound; position++) {
      const bout = bouts[roundStart[round]! + position]!;
      bout.nextIndex = roundStart[round + 1]! + Math.floor(position / 2);
      bout.nextSlot = position % 2 === 0 ? 'RED' : 'BLUE';
    }
  }

  // Resolve byes: a first-round bout with a single entrant is walked through
  // immediately, cascading in case a whole quarter is empty.
  for (let round = 1; round <= rounds; round++) {
    const boutsInRound = bracketSize / 2 ** round;
    for (let position = 0; position < boutsInRound; position++) {
      const bout = bouts[roundStart[round]! + position]!;
      const only = bout.red && !bout.blue ? bout.red : !bout.red && bout.blue ? bout.blue : null;
      if (!only || bout.nextIndex == null) continue;

      bout.isBye = true;
      const next = bouts[bout.nextIndex]!;
      if (bout.nextSlot === 'RED') next.red = only;
      else next.blue = only;
    }
  }

  return {
    bracketSize,
    entrantCount,
    byes: bracketSize - entrantCount,
    rounds,
    bouts,
    seedOrder: ordered.filter(Boolean).map((e) => e.entryId),
  };
}

/**
 * WT standard: both semi-final losers take bronze, so there is no bronze
 * play-off. Returns the flat bout indices of the semi-finals (empty when the
 * draw is too small to have any).
 */
export function semiFinalIndices(bracket: Bracket): number[] {
  if (bracket.rounds < 2) return [];
  const semiRound = bracket.rounds - 1;
  const indices: number[] = [];
  bracket.bouts.forEach((bout, idx) => {
    if (bout.round === semiRound) indices.push(idx);
  });
  return indices;
}
