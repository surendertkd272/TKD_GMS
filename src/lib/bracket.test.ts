import { describe, expect, it } from 'vitest';
import { buildBracket, nextPowerOfTwo, seedSlots, semiFinalIndices, type DrawEntrant } from './bracket';
import { BELT_GRADES } from './constants';

/** Distinct belts (highest first) so BELT-strategy ordering is deterministic — no ties to shuffle. */
function entrants(count: number, schoolOf: (i: number) => string = (i) => `school-${i}`): DrawEntrant[] {
  return Array.from({ length: count }, (_, i) => ({
    entryId: `e${i + 1}`,
    participantName: `Athlete ${i + 1}`,
    schoolId: schoolOf(i),
    beltGrade: BELT_GRADES[BELT_GRADES.length - 1 - i]!, // e[0] gets the highest belt → seed 1
  }));
}

describe('nextPowerOfTwo', () => {
  it.each([
    [1, 2],
    [2, 2],
    [3, 4],
    [4, 4],
    [5, 8],
    [8, 8],
    [9, 16],
  ])('nextPowerOfTwo(%i) === %i', (input, expected) => {
    expect(nextPowerOfTwo(input)).toBe(expected);
  });
});

describe('seedSlots', () => {
  it('produces the standard tournament slot order', () => {
    expect(seedSlots(2)).toEqual([1, 2]);
    expect(seedSlots(4)).toEqual([1, 4, 2, 3]);
    expect(seedSlots(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe('buildBracket — full field, no byes', () => {
  const bracket = buildBracket(entrants(8), 'BELT');

  it('sizes the bracket exactly to the field', () => {
    expect(bracket.bracketSize).toBe(8);
    expect(bracket.entrantCount).toBe(8);
    expect(bracket.byes).toBe(0);
    expect(bracket.rounds).toBe(3);
    expect(bracket.bouts).toHaveLength(7); // 4 + 2 + 1
  });

  it('labels rounds correctly', () => {
    const labels = bracket.bouts.map((b) => b.roundLabel);
    expect(labels.filter((l) => l === 'Quarter-final')).toHaveLength(4);
    expect(labels.filter((l) => l === 'Semi-final')).toHaveLength(2);
    expect(labels.filter((l) => l === 'Final')).toHaveLength(1);
  });

  it('never seats seed 1 and seed 2 in the same round-1 bout', () => {
    const round1 = bracket.bouts.filter((b) => b.round === 1);
    for (const bout of round1) {
      const seeds = [bout.red?.seed, bout.blue?.seed].filter((s): s is number => s != null);
      expect(seeds).not.toEqual(expect.arrayContaining([1, 2]));
    }
  });

  it('wires every non-final bout forward into exactly one slot of the next round', () => {
    const final = bracket.bouts[bracket.bouts.length - 1]!;
    expect(final.nextIndex).toBeNull();

    for (let i = 0; i < bracket.bouts.length - 1; i++) {
      const bout = bracket.bouts[i]!;
      expect(bout.nextIndex).not.toBeNull();
      expect(['RED', 'BLUE']).toContain(bout.nextSlot);
    }

    // Both semi-finals must feed the same final bout, one to each corner.
    const semis = bracket.bouts.filter((b) => b.roundLabel === 'Semi-final');
    const finalIndex = bracket.bouts.length - 1;
    expect(semis.map((s) => s.nextIndex)).toEqual([finalIndex, finalIndex]);
    expect(new Set(semis.map((s) => s.nextSlot))).toEqual(new Set(['RED', 'BLUE']));
  });

  it('marks no bout as a bye when the field exactly fills the bracket', () => {
    expect(bracket.bouts.every((b) => !b.isBye)).toBe(true);
  });
});

describe('buildBracket — byes go to the strongest seeds', () => {
  const bracket = buildBracket(entrants(5), 'BELT');

  it('pads to the next power of two and computes the right bye count', () => {
    expect(bracket.bracketSize).toBe(8);
    expect(bracket.byes).toBe(3);
  });

  it('gives byes only to round-1 bouts with a single entrant, advancing them', () => {
    const round1 = bracket.bouts.filter((b) => b.round === 1);
    const byeBouts = round1.filter((b) => b.isBye);
    expect(byeBouts).toHaveLength(3);

    for (const bout of byeBouts) {
      const lone = bout.red ?? bout.blue;
      expect(lone).not.toBeNull();
      const next = bracket.bouts[bout.nextIndex!]!;
      const advanced = bout.nextSlot === 'RED' ? next.red : next.blue;
      expect(advanced?.entryId).toBe(lone!.entryId);
    }
  });

  it('leaves the one fully-contested round-1 bout as a real match', () => {
    const contested = bracket.bouts.filter((b) => b.round === 1 && !b.isBye);
    expect(contested).toHaveLength(1);
    expect(contested[0]!.red).not.toBeNull();
    expect(contested[0]!.blue).not.toBeNull();
  });

  it('fills a round-2 slot immediately when both its feeders were byes, and leaves it open otherwise', () => {
    const round1 = bracket.bouts.filter((b) => b.round === 1);
    const round2 = bracket.bouts.filter((b) => b.round === 2);

    for (const bout of round2) {
      const feeders = round1.filter((b) => b.nextIndex === bracket.bouts.indexOf(bout));
      const bothFeedersWereByes = feeders.every((f) => f.isBye);
      const filledSlots = [bout.red, bout.blue].filter(Boolean).length;
      expect(filledSlots).toBe(bothFeedersWereByes ? 2 : 1);
    }
  });
});

describe('buildBracket — same-school first-round clashes are avoided when possible', () => {
  it('does not seat two athletes from the same school in round 1 if an alternative exists', () => {
    // Seeds 1 and 2 (the strongest two) share a school; every other entrant is from a distinct school,
    // so spreadSchools has room to separate them without creating a new clash.
    const field = entrants(8).map((e, i) => (i === 0 || i === 1 ? { ...e, schoolId: 'shared-school' } : e));
    const bracket = buildBracket(field, 'BELT');

    const round1 = bracket.bouts.filter((b) => b.round === 1);
    for (const bout of round1) {
      if (bout.red && bout.blue) {
        const redEntrant = field.find((e) => e.entryId === bout.red!.entryId)!;
        const blueEntrant = field.find((e) => e.entryId === bout.blue!.entryId)!;
        expect(redEntrant.schoolId).not.toBe(blueEntrant.schoolId);
      }
    }
  });
});

describe('semiFinalIndices', () => {
  it('is empty for a final-only (2-entrant) bracket', () => {
    const bracket = buildBracket(entrants(2), 'BELT');
    expect(semiFinalIndices(bracket)).toEqual([]);
  });

  it('returns both semi-final bout indices for an 8-entrant bracket', () => {
    const bracket = buildBracket(entrants(8), 'BELT');
    const indices = semiFinalIndices(bracket);
    expect(indices).toHaveLength(2);
    for (const idx of indices) {
      expect(bracket.bouts[idx]!.roundLabel).toBe('Semi-final');
    }
  });
});
