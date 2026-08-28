import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  createBout,
  createCategory,
  createEntry,
  createMat,
  createParticipant,
  createReferee,
  createSchool,
  resetDb,
} from '@/test/factories';
import { autoSchedule, detectScheduleConflicts } from './tournament';

beforeEach(async () => {
  await resetDb();
});

describe('autoSchedule', () => {
  it('assigns each bout to whichever mat frees up soonest, in round/category/position order', async () => {
    const matA = await createMat({ sortOrder: 1 });
    const matB = await createMat({ sortOrder: 2 });
    const catA = await createCategory({ sortOrder: 1 });
    const catB = await createCategory({ sortOrder: 2 });

    const boutA0 = await createBout({ categoryId: catA.id, position: 0 });
    const boutA1 = await createBout({ categoryId: catA.id, position: 1 });
    const boutB0 = await createBout({ categoryId: catB.id, position: 0 });
    const boutB1 = await createBout({ categoryId: catB.id, position: 1 });

    const startAt = new Date(2026, 8, 20, 9, 0, 0);
    const scheduled = await autoSchedule(startAt, 10);
    expect(scheduled).toBe(4);

    const tenMinLater = new Date(startAt.getTime() + 10 * 60_000);
    const byId = Object.fromEntries((await db.bout.findMany()).map((b) => [b.id, b]));

    // Category A's two bouts go one to each mat first (breadth-first); category B's
    // bouts then take the next slot on whichever mat is free at that point.
    expect(byId[boutA0.id]).toMatchObject({ matId: matA.id, scheduledAt: startAt });
    expect(byId[boutA1.id]).toMatchObject({ matId: matB.id, scheduledAt: startAt });
    expect(byId[boutB0.id]).toMatchObject({ matId: matA.id, scheduledAt: tenMinLater });
    expect(byId[boutB1.id]).toMatchObject({ matId: matB.id, scheduledAt: tenMinLater });
  });

  it('renumbers bouts in category-then-round-then-position order as a side effect', async () => {
    await createMat(); // autoSchedule no-ops (and skips renumbering) with zero active mats
    const catA = await createCategory({ sortOrder: 1 });
    const catB = await createCategory({ sortOrder: 2 });
    const boutB0 = await createBout({ categoryId: catB.id, position: 0 });
    const boutA0 = await createBout({ categoryId: catA.id, position: 0 });

    await autoSchedule(new Date(2026, 8, 20, 9, 0, 0), 10);

    const [refreshedA, refreshedB] = await Promise.all([
      db.bout.findUniqueOrThrow({ where: { id: boutA0.id } }),
      db.bout.findUniqueOrThrow({ where: { id: boutB0.id } }),
    ]);
    expect(refreshedA.boutNumber).toBeLessThan(refreshedB.boutNumber);
  });

  it('ignores inactive mats and leaves BYE/COMPLETED bouts untouched', async () => {
    const activeMat = await createMat({ sortOrder: 1, active: true });
    await createMat({ sortOrder: 2, active: false });
    const cat = await createCategory();

    const byeBout = await createBout({ categoryId: cat.id, position: 0, status: 'BYE' });
    const completedBout = await createBout({ categoryId: cat.id, position: 1, status: 'COMPLETED' });
    const openBout = await createBout({ categoryId: cat.id, position: 2, status: 'SCHEDULED' });

    const scheduled = await autoSchedule(new Date(2026, 8, 20, 9, 0, 0), 10);
    expect(scheduled).toBe(1);

    const [bye, completed, open] = await Promise.all([
      db.bout.findUniqueOrThrow({ where: { id: byeBout.id } }),
      db.bout.findUniqueOrThrow({ where: { id: completedBout.id } }),
      db.bout.findUniqueOrThrow({ where: { id: openBout.id } }),
    ]);
    expect(bye.matId).toBeNull();
    expect(completed.matId).toBeNull();
    expect(open.matId).toBe(activeMat.id);
  });
});

describe('detectScheduleConflicts', () => {
  it('returns no conflicts for a cleanly separated schedule', async () => {
    const mat = await createMat();
    const cat = await createCategory();
    const school = await createSchool();
    const [p1, p2, p3, p4] = await Promise.all([
      createParticipant(school.id),
      createParticipant(school.id),
      createParticipant(school.id),
      createParticipant(school.id),
    ]);

    await createBout({
      categoryId: cat.id,
      redEntryId: (await createEntry(p1.id, cat.id)).id,
      blueEntryId: (await createEntry(p2.id, cat.id)).id,
      matId: mat.id,
      scheduledAt: new Date(2026, 8, 20, 9, 0, 0),
    });
    await createBout({
      categoryId: cat.id,
      position: 1,
      redEntryId: (await createEntry(p3.id, cat.id)).id,
      blueEntryId: (await createEntry(p4.id, cat.id)).id,
      matId: mat.id,
      scheduledAt: new Date(2026, 8, 20, 9, 30, 0), // same mat, well outside the overlap window
    });

    expect(await detectScheduleConflicts()).toEqual([]);
  });

  it('flags an athlete scheduled on two mats at the same time', async () => {
    const school = await createSchool();
    const athlete = await createParticipant(school.id, { name: 'Double Booked Athlete' });
    const [catA, catB] = await Promise.all([createCategory(), createCategory()]);
    const [opponentA, opponentB] = await Promise.all([createParticipant(school.id), createParticipant(school.id)]);
    const [matA, matB] = await Promise.all([createMat(), createMat()]);
    const at = new Date(2026, 8, 20, 10, 0, 0);

    await createBout({
      categoryId: catA.id,
      redEntryId: (await createEntry(athlete.id, catA.id)).id,
      blueEntryId: (await createEntry(opponentA.id, catA.id)).id,
      matId: matA.id,
      scheduledAt: at,
    });
    await createBout({
      categoryId: catB.id,
      redEntryId: (await createEntry(athlete.id, catB.id)).id,
      blueEntryId: (await createEntry(opponentB.id, catB.id)).id,
      matId: matB.id,
      scheduledAt: at,
    });

    const conflicts = await detectScheduleConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: 'ATHLETE_DOUBLE_BOOKED' });
    expect(conflicts[0]!.message).toContain('Double Booked Athlete');
  });

  it('flags two different bouts overlapping on the same mat', async () => {
    const mat = await createMat();
    const [catA, catB] = await Promise.all([createCategory(), createCategory()]);
    const school = await createSchool();
    const [p1, p2, p3, p4] = await Promise.all([
      createParticipant(school.id),
      createParticipant(school.id),
      createParticipant(school.id),
      createParticipant(school.id),
    ]);
    const at = new Date(2026, 8, 20, 10, 0, 0);

    await createBout({
      categoryId: catA.id,
      redEntryId: (await createEntry(p1.id, catA.id)).id,
      blueEntryId: (await createEntry(p2.id, catA.id)).id,
      matId: mat.id,
      scheduledAt: at,
    });
    await createBout({
      categoryId: catB.id,
      redEntryId: (await createEntry(p3.id, catB.id)).id,
      blueEntryId: (await createEntry(p4.id, catB.id)).id,
      matId: mat.id,
      scheduledAt: at,
    });

    const conflicts = await detectScheduleConflicts();
    expect(conflicts.some((c) => c.kind === 'MAT_OVERLAP')).toBe(true);
  });

  it('flags a referee assigned to two mats at the same time', async () => {
    const referee = await createReferee();
    const [matA, matB] = await Promise.all([createMat(), createMat()]);
    const [catA, catB] = await Promise.all([createCategory(), createCategory()]);
    const school = await createSchool();
    const [p1, p2, p3, p4] = await Promise.all([
      createParticipant(school.id),
      createParticipant(school.id),
      createParticipant(school.id),
      createParticipant(school.id),
    ]);
    const at = new Date(2026, 8, 20, 10, 0, 0);

    await createBout({
      categoryId: catA.id,
      redEntryId: (await createEntry(p1.id, catA.id)).id,
      blueEntryId: (await createEntry(p2.id, catA.id)).id,
      matId: matA.id,
      scheduledAt: at,
      refereeId: referee.id,
    });
    await createBout({
      categoryId: catB.id,
      redEntryId: (await createEntry(p3.id, catB.id)).id,
      blueEntryId: (await createEntry(p4.id, catB.id)).id,
      matId: matB.id,
      scheduledAt: at,
      refereeId: referee.id,
    });

    const conflicts = await detectScheduleConflicts();
    expect(conflicts.some((c) => c.kind === 'REFEREE_DOUBLE_BOOKED')).toBe(true);
  });

  it('flags a bout scheduled at or before the bout that feeds it', async () => {
    const cat = await createCategory();
    const mat = await createMat();
    const school = await createSchool();
    const [p1, p2] = await Promise.all([createParticipant(school.id), createParticipant(school.id)]);

    const final = await createBout({
      categoryId: cat.id,
      round: 2,
      position: 0,
      roundLabel: 'Final',
      matId: mat.id,
      scheduledAt: new Date(2026, 8, 20, 9, 0, 0),
    });
    await createBout({
      categoryId: cat.id,
      round: 1,
      position: 0,
      roundLabel: 'Semi-final',
      redEntryId: (await createEntry(p1.id, cat.id)).id,
      blueEntryId: (await createEntry(p2.id, cat.id)).id,
      matId: mat.id,
      scheduledAt: new Date(2026, 8, 20, 9, 30, 0), // feeder scheduled AFTER the final it feeds
      nextBoutId: final.id,
      nextBoutSlot: 'RED',
    });

    const conflicts = await detectScheduleConflicts();
    expect(conflicts.some((c) => c.kind === 'UNSCHEDULED_DEPENDENCY')).toBe(true);
  });
});
