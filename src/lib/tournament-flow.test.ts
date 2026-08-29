import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  createCategory,
  createEntry,
  createParticipant,
  createReferee,
  createSchool,
  resetDb,
} from '@/test/factories';
import { generateDraw, recordBoutResult, walkoverBout, finalizePoomsae } from './tournament';

beforeEach(async () => {
  await resetDb();
});

/** Builds a Kyorugi category with `count` approved entries, ready to draw. */
async function kyorugiCategoryWithEntries(count: number) {
  const category = await createCategory({ event: 'KYORUGI' });
  const school = await createSchool();
  const entries = [];
  for (let i = 0; i < count; i++) {
    const participant = await createParticipant(school.id, { status: 'APPROVED', name: `Athlete ${i + 1}` });
    entries.push(await createEntry(participant.id, category.id));
  }
  return { category, entries };
}

describe('generateDraw — Kyorugi', () => {
  it('builds a bracket and marks the category GENERATED', async () => {
    const { category } = await kyorugiCategoryWithEntries(4);
    const referee = await createReferee();

    const result = await generateDraw(category.id, 'BELT', referee.id);
    expect(result).toMatchObject({ ok: true, entrants: 4, bouts: 3, byes: 0 });

    const refreshed = await db.category.findUniqueOrThrow({ where: { id: category.id } });
    expect(refreshed.drawStatus).toBe('GENERATED');

    const bouts = await db.bout.findMany({ where: { categoryId: category.id } });
    expect(bouts).toHaveLength(3);
  });

  it('refuses to regenerate a locked draw', async () => {
    const { category } = await kyorugiCategoryWithEntries(2);
    const referee = await createReferee();
    await db.category.update({ where: { id: category.id }, data: { drawStatus: 'LOCKED' } });

    const result = await generateDraw(category.id, 'BELT', referee.id);
    expect(result).toMatchObject({ ok: false });
  });

  it('refuses to draw a category with no approved entries', async () => {
    const category = await createCategory({ event: 'KYORUGI' });
    const school = await createSchool();
    const participant = await createParticipant(school.id, { status: 'PENDING' });
    await createEntry(participant.id, category.id);
    const referee = await createReferee();

    const result = await generateDraw(category.id, 'BELT', referee.id);
    expect(result).toMatchObject({ ok: false });
  });
});

describe('generateDraw — Poomsae', () => {
  it('sets a performance order instead of a bracket', async () => {
    const category = await createCategory({ event: 'POOMSAE' });
    const school = await createSchool();
    const entries = [];
    for (let i = 0; i < 3; i++) {
      const participant = await createParticipant(school.id, { status: 'APPROVED' });
      entries.push(await createEntry(participant.id, category.id));
    }
    const referee = await createReferee();

    const result = await generateDraw(category.id, 'BELT', referee.id);
    expect(result).toMatchObject({ ok: true, entrants: 3, bouts: 0, byes: 0 });

    const refreshedEntries = await db.entry.findMany({ where: { categoryId: category.id } });
    const seeds = refreshedEntries.map((e) => e.seed).sort();
    expect(seeds).toEqual([1, 2, 3]);
  });
});

describe('recordBoutResult — full bracket playthrough and medal award', () => {
  it('awards gold+silver from the final and bronze to both semi-final losers', async () => {
    const { category, entries } = await kyorugiCategoryWithEntries(4);
    const referee = await createReferee();

    await generateDraw(category.id, 'BELT', referee.id);

    const round1 = await db.bout.findMany({ where: { categoryId: category.id, round: 1 }, orderBy: { position: 'asc' } });
    expect(round1).toHaveLength(2);

    // Play both semis — red corner wins each.
    for (const bout of round1) {
      const result = await recordBoutResult({
        boutId: bout.id,
        winner: 'RED',
        resultType: 'POINTS',
        redScore: 5,
        blueScore: 2,
        actorId: referee.id,
      });
      expect(result).toMatchObject({ ok: true, categoryFinalized: false });
    }

    const final = await db.bout.findFirstOrThrow({ where: { categoryId: category.id, round: 2 } });
    expect(final.redEntryId).not.toBeNull();
    expect(final.blueEntryId).not.toBeNull();

    const finalResult = await recordBoutResult({
      boutId: final.id,
      winner: 'RED',
      resultType: 'POINTS',
      redScore: 8,
      blueScore: 3,
      actorId: referee.id,
    });
    expect(finalResult).toMatchObject({ ok: true, categoryFinalized: true });

    const refreshedCategory = await db.category.findUniqueOrThrow({ where: { id: category.id } });
    expect(refreshedCategory.finalized).toBe(true);
    expect(refreshedCategory.drawStatus).toBe('LOCKED');

    const results = await db.result.findMany({ where: { categoryId: category.id } });
    const byMedal = Object.fromEntries(['GOLD', 'SILVER', 'BRONZE'].map((m) => [m, results.filter((r) => r.medal === m)]));
    expect(byMedal.GOLD).toHaveLength(1);
    expect(byMedal.SILVER).toHaveLength(1);
    expect(byMedal.BRONZE).toHaveLength(2); // both semi-final losers — no bronze play-off
    expect(results).toHaveLength(4); // every one of the 4 entrants gets a Result row

    const goldEntryId = byMedal.GOLD![0]!.entryId;
    expect(entries.map((e) => e.id)).toContain(goldEntryId);
  });

  it('rejects a result once the category is already finalised', async () => {
    const { category } = await kyorugiCategoryWithEntries(2);
    const referee = await createReferee();
    await generateDraw(category.id, 'BELT', referee.id);
    const final = await db.bout.findFirstOrThrow({ where: { categoryId: category.id } });

    await recordBoutResult({ boutId: final.id, winner: 'RED', resultType: 'POINTS', redScore: 3, blueScore: 0, actorId: referee.id });

    const secondAttempt = await recordBoutResult({ boutId: final.id, winner: 'BLUE', resultType: 'POINTS', redScore: 0, blueScore: 3, actorId: referee.id });
    expect(secondAttempt).toMatchObject({ ok: false });
  });

  it('rejects a winner corner with no athlete assigned', async () => {
    const { category } = await kyorugiCategoryWithEntries(4);
    const referee = await createReferee();
    await generateDraw(category.id, 'BELT', referee.id);

    const final = await db.bout.findFirstOrThrow({ where: { categoryId: category.id, round: 2 } });
    // Neither semi has been played, so the final has no entries assigned yet.
    const result = await recordBoutResult({ boutId: final.id, winner: 'RED', resultType: 'POINTS', redScore: 1, blueScore: 0, actorId: referee.id });
    expect(result).toMatchObject({ ok: false });
  });
});

describe('walkoverBout', () => {
  it('marks the loser WITHDRAWN only when the reason is WITHDRAWAL, not WALKOVER', async () => {
    const { category } = await kyorugiCategoryWithEntries(2);
    const referee = await createReferee();
    await generateDraw(category.id, 'BELT', referee.id);
    const bout = await db.bout.findFirstOrThrow({ where: { categoryId: category.id } });
    const loserEntryId = bout.blueEntryId!;

    await walkoverBout(bout.id, 'RED', 'WALKOVER', referee.id);
    const afterWalkover = await db.entry.findUniqueOrThrow({ where: { id: loserEntryId } });
    expect(afterWalkover.status).toBe('ACTIVE');
  });

  it('marks the loser WITHDRAWN for a WITHDRAWAL', async () => {
    const { category } = await kyorugiCategoryWithEntries(2);
    const referee = await createReferee();
    await generateDraw(category.id, 'BELT', referee.id);
    const bout = await db.bout.findFirstOrThrow({ where: { categoryId: category.id } });
    const loserEntryId = bout.blueEntryId!;

    await walkoverBout(bout.id, 'RED', 'WITHDRAWAL', referee.id);
    const afterWithdrawal = await db.entry.findUniqueOrThrow({ where: { id: loserEntryId } });
    expect(afterWithdrawal.status).toBe('WITHDRAWN');
  });
});

describe('finalizePoomsae', () => {
  async function poomsaeCategoryWithScores(scores: number[]) {
    const category = await createCategory({ event: 'POOMSAE' });
    const school = await createSchool();
    const judge = await createReferee({ isJury: true });
    const entries = [];
    for (const total of scores) {
      const participant = await createParticipant(school.id, { status: 'APPROVED' });
      const entry = await createEntry(participant.id, category.id);
      await db.poomsaeScore.create({
        data: { entryId: entry.id, judgeId: judge.id, accuracy: total / 2, presentation: total / 2, total },
      });
      entries.push(entry);
    }
    return { category, entries };
  }

  it('ranks entries by score and awards medals to the top 3', async () => {
    const { category, entries } = await poomsaeCategoryWithScores([9.5, 8.0, 8.8, 7.0]);
    const referee = await createReferee();

    const result = await finalizePoomsae(category.id, referee.id);
    expect(result).toMatchObject({ ok: true, ranked: 4 });

    const results = await db.result.findMany({ where: { categoryId: category.id } });
    const gold = results.find((r) => r.medal === 'GOLD')!;
    const silver = results.find((r) => r.medal === 'SILVER')!;
    const bronze = results.find((r) => r.medal === 'BRONZE')!;

    expect(gold.entryId).toBe(entries[0]!.id); // 9.5
    expect(silver.entryId).toBe(entries[2]!.id); // 8.8
    expect(bronze.entryId).toBe(entries[1]!.id); // 8.0

    const refreshedCategory = await db.category.findUniqueOrThrow({ where: { id: category.id } });
    expect(refreshedCategory.finalized).toBe(true);
  });

  it('refuses to finalise while any entry has no judge score', async () => {
    const { category } = await poomsaeCategoryWithScores([9.0]);
    const school = await createSchool();
    const unscoredParticipant = await createParticipant(school.id, { status: 'APPROVED' });
    await createEntry(unscoredParticipant.id, category.id);
    const referee = await createReferee();

    const result = await finalizePoomsae(category.id, referee.id);
    expect(result).toMatchObject({ ok: false });
  });

  it('refuses to finalise a Kyorugi category', async () => {
    const { category } = await kyorugiCategoryWithEntries(2);
    const referee = await createReferee();

    const result = await finalizePoomsae(category.id, referee.id);
    expect(result).toMatchObject({ ok: false });
  });
});
