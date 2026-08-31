import 'server-only';
import { db } from './db';
import { buildBracket, type DrawEntrant, type SeedStrategy } from './bracket';
import { computePoomsaeScore, rankPoomsae } from './poomsae';
import { roundLabel } from './constants';
import { logAudit } from './auth';

// ---------------------------------------------------------------------------
// Category resolution — turns "this athlete, this event" into a division
// ---------------------------------------------------------------------------
export type CategoryMatch =
  | { ok: true; categoryId: string; categoryName: string }
  | { ok: false; reason: string };

export async function resolveCategory(input: {
  eventId: string;
  discipline: 'KYORUGI' | 'POOMSAE';
  ageCategory: string;
  gender: string;
  weightKg: number;
}): Promise<CategoryMatch> {
  const candidates = await db.category.findMany({
    where: {
      eventId: input.eventId,
      discipline: input.discipline,
      ageCategory: input.ageCategory,
      gender: { in: [input.gender, 'MIXED'] },
      active: true,
    },
    orderBy: { sortOrder: 'asc' },
  });

  if (!candidates.length) {
    return { ok: false, reason: `No ${input.discipline} category is configured for this age group and gender.` };
  }

  if (input.discipline === 'POOMSAE') {
    const recognised = candidates.find((c) => c.poomsaeType === 'RECOGNISED') ?? candidates[0]!;
    return { ok: true, categoryId: recognised.id, categoryName: recognised.name };
  }

  const match = candidates.find((c) => {
    const aboveMin = c.weightMin == null || input.weightKg > c.weightMin;
    const belowMax = c.weightMax == null || input.weightKg <= c.weightMax;
    return aboveMin && belowMax;
  });

  if (!match) {
    return {
      ok: false,
      reason: `Weight ${input.weightKg} kg does not fall in any configured division for this age group.`,
    };
  }

  return { ok: true, categoryId: match.id, categoryName: match.name };
}

/**
 * Re-points a participant's entries at the divisions their current details imply.
 * Called on create and on every edit, because a weight or DOB correction can move
 * an athlete between divisions.
 */
export async function syncParticipantEntries(
  participantId: string,
  disciplines: ('KYORUGI' | 'POOMSAE')[],
): Promise<{ created: string[]; removed: number; warnings: string[] }> {
  const participant = await db.participant.findUnique({
    where: { id: participantId },
    include: { entries: { include: { category: true } }, school: { select: { eventId: true } } },
  });
  if (!participant) throw new Error('Participant not found');

  const warnings: string[] = [];
  const created: string[] = [];
  const keepEntryIds: string[] = [];

  if (participant.personRole !== 'ATHLETE') {
    // Coaches / officials / volunteers are accredited but never drawn.
    const removed = await db.entry.deleteMany({ where: { participantId } });
    return { created, removed: removed.count, warnings };
  }

  for (const discipline of disciplines) {
    const match = await resolveCategory({
      eventId: participant.school.eventId,
      discipline,
      ageCategory: participant.ageCategory,
      gender: participant.gender,
      weightKg: participant.weightKg,
    });

    if (!match.ok) {
      warnings.push(`${discipline}: ${match.reason}`);
      continue;
    }

    const existing = participant.entries.find((e) => e.categoryId === match.categoryId);
    if (existing) {
      keepEntryIds.push(existing.id);
      continue;
    }

    // Never silently move an athlete out of a division whose draw is already live.
    const staleInDiscipline = participant.entries.filter((e) => e.category.discipline === discipline);
    const locked = staleInDiscipline.find((e) => e.category.drawStatus === 'PUBLISHED' || e.category.drawStatus === 'LOCKED');
    if (locked) {
      keepEntryIds.push(locked.id);
      warnings.push(
        `${discipline}: draw for ${locked.category.name} is already published — division change to ${match.categoryName} needs a Super Admin.`,
      );
      continue;
    }

    const entry = await db.entry.create({ data: { participantId, categoryId: match.categoryId } });
    keepEntryIds.push(entry.id);
    created.push(match.categoryName);
  }

  const stale = participant.entries.filter((e) => !keepEntryIds.includes(e.id));
  let removed = 0;
  for (const entry of stale) {
    if (entry.category.drawStatus === 'PUBLISHED' || entry.category.drawStatus === 'LOCKED') {
      warnings.push(`Entry in ${entry.category.name} kept — its draw is already published.`);
      continue;
    }
    await db.entry.delete({ where: { id: entry.id } });
    removed++;
  }

  return { created, removed, warnings };
}

// ---------------------------------------------------------------------------
// Draw generation
// ---------------------------------------------------------------------------
export async function generateDraw(
  categoryId: string,
  strategy: SeedStrategy,
  actorId: string,
): Promise<{ ok: true; bouts: number; entrants: number; byes: number } | { ok: false; error: string }> {
  const category = await db.category.findUnique({
    where: { id: categoryId },
    include: {
      entries: {
        where: { status: 'ACTIVE' },
        include: { participant: { select: { name: true, schoolId: true, beltGrade: true, status: true } } },
      },
    },
  });
  if (!category) return { ok: false, error: 'Category not found.' };
  if (category.drawStatus === 'LOCKED') return { ok: false, error: 'Draw is locked. Unlock it before regenerating.' };

  const eligible = category.entries.filter((e) => e.participant.status === 'APPROVED');
  if (eligible.length < 1) return { ok: false, error: 'No approved entries in this category yet.' };

  if (category.discipline === 'POOMSAE') {
    // Poomsae is a ranked performance order, not a bracket.
    await db.$transaction(async (tx) => {
      const shuffled = [...eligible].sort(() => Math.random() - 0.5);
      for (let i = 0; i < shuffled.length; i++) {
        await tx.entry.update({ where: { id: shuffled[i]!.id }, data: { seed: i + 1 } });
      }
      await tx.category.update({ where: { id: categoryId }, data: { drawStatus: 'GENERATED' } });
    });
    await logAudit({
      userId: actorId,
      action: 'DRAW_GENERATED',
      entityType: 'Category',
      entityId: categoryId,
      detail: `Poomsae performance order for ${eligible.length} entries`,
    });
    return { ok: true, bouts: 0, entrants: eligible.length, byes: 0 };
  }

  const entrants: DrawEntrant[] = eligible.map((e) => ({
    entryId: e.id,
    participantName: e.participant.name,
    schoolId: e.participant.schoolId,
    beltGrade: e.participant.beltGrade,
  }));

  const bracket = buildBracket(entrants, strategy);

  await db.$transaction(async (tx) => {
    await tx.bout.deleteMany({ where: { categoryId } });

    // Persist seeds so the published draw sheet can show them.
    for (let i = 0; i < bracket.seedOrder.length; i++) {
      await tx.entry.update({ where: { id: bracket.seedOrder[i]! }, data: { seed: i + 1 } });
    }

    // Two passes: create every bout, then wire the forward links.
    const createdIds: string[] = [];
    for (const bout of bracket.bouts) {
      const row = await tx.bout.create({
        data: {
          categoryId,
          round: bout.round,
          roundLabel: bout.roundLabel,
          position: bout.position,
          boutNumber: 0,
          redEntryId: bout.red?.entryId ?? null,
          blueEntryId: bout.blue?.entryId ?? null,
          status: bout.isBye ? 'BYE' : 'SCHEDULED',
          winnerEntryId: bout.isBye ? (bout.red?.entryId ?? bout.blue?.entryId ?? null) : null,
          resultType: bout.isBye ? 'WALKOVER' : null,
          completedAt: bout.isBye ? new Date() : null,
        },
      });
      createdIds.push(row.id);
    }

    for (let i = 0; i < bracket.bouts.length; i++) {
      const bout = bracket.bouts[i]!;
      if (bout.nextIndex == null) continue;
      await tx.bout.update({
        where: { id: createdIds[i]! },
        data: { nextBoutId: createdIds[bout.nextIndex]!, nextBoutSlot: bout.nextSlot },
      });
    }

    await tx.category.update({ where: { id: categoryId }, data: { drawStatus: 'GENERATED', finalized: false } });
    await tx.result.deleteMany({ where: { categoryId } });
  });

  await logAudit({
    userId: actorId,
    action: 'DRAW_GENERATED',
    entityType: 'Category',
    entityId: categoryId,
    detail: `${bracket.entrantCount} entrants, bracket of ${bracket.bracketSize}, ${bracket.byes} bye(s), ${strategy} seeding`,
  });

  return { ok: true, bouts: bracket.bouts.length, entrants: bracket.entrantCount, byes: bracket.byes };
}

/** Assign running bout numbers across every published category in one event. */
export async function renumberBouts(eventId: string): Promise<number> {
  const bouts = await db.bout.findMany({
    where: { status: { not: 'BYE' }, category: { eventId } },
    orderBy: [{ category: { sortOrder: 'asc' } }, { round: 'asc' }, { position: 'asc' }],
    select: { id: true },
  });

  let n = 0;
  for (const bout of bouts) {
    n += 1;
    await db.bout.update({ where: { id: bout.id }, data: { boutNumber: n } });
  }
  return n;
}

// ---------------------------------------------------------------------------
// Live bout results
// ---------------------------------------------------------------------------
export type BoutResultInput = {
  boutId: string;
  winner: 'RED' | 'BLUE';
  resultType: string;
  redScore: number;
  blueScore: number;
  redGamJeom?: number;
  blueGamJeom?: number;
  rounds?: { roundNo: number; redPoints: number; bluePoints: number; redGamJeom: number; blueGamJeom: number }[];
  actorId: string;
};

/**
 * Every bout downstream of this one that has already been fought.
 *
 * Correcting a completed bout rewrites the winner into the next bout's corner.
 * If that bout — or anything after it — has already been played, the rest of the
 * bracket still records the old athlete, and the medal calculation reads that
 * stale chain. Walking the feed forward is what lets us refuse instead.
 */
export async function playedDownstreamBouts(
  boutId: string,
): Promise<{ id: string; roundLabel: string; boutNumber: number | null }[]> {
  const played: { id: string; roundLabel: string; boutNumber: number | null }[] = [];
  const seen = new Set<string>([boutId]);

  let cursor = await db.bout.findUnique({
    where: { id: boutId },
    select: { nextBoutId: true },
  });

  while (cursor?.nextBoutId && !seen.has(cursor.nextBoutId)) {
    seen.add(cursor.nextBoutId);
    const next = await db.bout.findUnique({
      where: { id: cursor.nextBoutId },
      select: { id: true, status: true, roundLabel: true, boutNumber: true, nextBoutId: true },
    });
    if (!next) break;
    if (next.status === 'COMPLETED' || next.status === 'BYE') {
      played.push({ id: next.id, roundLabel: next.roundLabel, boutNumber: next.boutNumber });
    }
    cursor = { nextBoutId: next.nextBoutId };
  }

  return played;
}

/**
 * Reopens a bout and everything after it, so a correction further back in the
 * bracket can be applied. Clears each bout's result and empties the corner the
 * superseded winner was advanced into.
 */
export async function reopenBoutChain(
  boutId: string,
  actorId: string,
): Promise<{ ok: true; reopened: number } | { ok: false; error: string }> {
  const bout = await db.bout.findUnique({ where: { id: boutId }, include: { category: true } });
  if (!bout) return { ok: false, error: 'Bout not found.' };

  const downstream = await playedDownstreamBouts(boutId);
  const ids = downstream.map((b) => b.id);
  if (ids.length === 0) return { ok: true, reopened: 0 };

  await db.$transaction(async (tx) => {
    // The category can no longer be final once part of its bracket is reopened.
    await tx.result.deleteMany({ where: { categoryId: bout.categoryId } });
    await tx.category.update({
      where: { id: bout.categoryId },
      data: { finalized: false, finalizedAt: null, drawStatus: 'PUBLISHED' },
    });

    for (const id of ids) {
      const target = await tx.bout.findUnique({
        where: { id },
        select: { nextBoutId: true, nextBoutSlot: true, winnerEntryId: true },
      });

      await tx.bout.update({
        where: { id },
        data: {
          status: 'SCHEDULED',
          winnerEntryId: null,
          resultType: null,
          redScore: 0,
          blueScore: 0,
          redGamJeom: 0,
          blueGamJeom: 0,
          completedAt: null,
        },
      });
      await tx.boutRound.deleteMany({ where: { boutId: id } });

      // Pull the superseded winner back out of the bout it fed.
      if (target?.nextBoutId && target.nextBoutSlot && !ids.includes(target.nextBoutId)) {
        await tx.bout.update({
          where: { id: target.nextBoutId },
          data: target.nextBoutSlot === 'RED' ? { redEntryId: null } : { blueEntryId: null },
        });
      }
    }
  });

  await logAudit({
    userId: actorId,
    action: 'BOUT_CHAIN_REOPENED',
    entityType: 'Bout',
    entityId: boutId,
    detail: `${bout.category.name}: reopened ${ids.length} downstream bout(s) so an earlier result could be corrected`,
  });

  return { ok: true, reopened: ids.length };
}

export async function recordBoutResult(
  input: BoutResultInput,
): Promise<{ ok: true; categoryFinalized: boolean } | { ok: false; error: string }> {
  const bout = await db.bout.findUnique({
    where: { id: input.boutId },
    include: { category: true, redEntry: { include: { participant: true } }, blueEntry: { include: { participant: true } } },
  });
  if (!bout) return { ok: false, error: 'Bout not found.' };
  if (bout.category.finalized) return { ok: false, error: 'This category is already finalised.' };

  const winnerEntryId = input.winner === 'RED' ? bout.redEntryId : bout.blueEntryId;
  if (!winnerEntryId) return { ok: false, error: `No athlete is assigned to the ${input.winner.toLowerCase()} corner.` };

  // Correcting a result that sends a different athlete forward would leave every
  // bout already fought after this one pointing at the superseded winner. Refuse
  // rather than silently desynchronise the bracket; the Technical Director can
  // reopen the affected bouts from live control and then re-enter this one.
  const changesWhoAdvances = bout.status === 'COMPLETED' && bout.winnerEntryId !== winnerEntryId;
  if (changesWhoAdvances) {
    const played = await playedDownstreamBouts(bout.id);
    if (played.length > 0) {
      const list = played
        .map((b) => (b.boutNumber ? `#${b.boutNumber} ${b.roundLabel}` : b.roundLabel))
        .join(', ');
      return {
        ok: false,
        error:
          `Changing the winner would contradict ${played.length} bout(s) already fought (${list}). ` +
          'Reopen them from live control first, then record this result again.',
      };
    }
  }

  await db.$transaction(async (tx) => {
    await tx.bout.update({
      where: { id: bout.id },
      data: {
        status: 'COMPLETED',
        winnerEntryId,
        resultType: input.resultType,
        redScore: input.redScore,
        blueScore: input.blueScore,
        redGamJeom: input.redGamJeom ?? 0,
        blueGamJeom: input.blueGamJeom ?? 0,
        completedAt: new Date(),
        startedAt: bout.startedAt ?? new Date(),
      },
    });

    if (input.rounds?.length) {
      await tx.boutRound.deleteMany({ where: { boutId: bout.id } });
      for (const r of input.rounds) {
        await tx.boutRound.create({
          data: {
            boutId: bout.id,
            roundNo: r.roundNo,
            redPoints: r.redPoints,
            bluePoints: r.bluePoints,
            redGamJeom: r.redGamJeom,
            blueGamJeom: r.blueGamJeom,
            winner: r.redPoints === r.bluePoints ? 'TIE' : r.redPoints > r.bluePoints ? 'RED' : 'BLUE',
          },
        });
      }
    }

    // Advance the winner into the next bout.
    if (bout.nextBoutId && bout.nextBoutSlot) {
      await tx.bout.update({
        where: { id: bout.nextBoutId },
        data: bout.nextBoutSlot === 'RED' ? { redEntryId: winnerEntryId } : { blueEntryId: winnerEntryId },
      });
    }

    if (input.resultType === 'DISQUALIFICATION') {
      const loserEntryId = input.winner === 'RED' ? bout.blueEntryId : bout.redEntryId;
      if (loserEntryId) await tx.entry.update({ where: { id: loserEntryId }, data: { status: 'DISQUALIFIED' } });
    }
  });

  await logAudit({
    userId: input.actorId,
    action: 'BOUT_RESULT',
    entityType: 'Bout',
    entityId: bout.id,
    detail: `${bout.category.name} ${bout.roundLabel}: ${input.winner} won ${input.redScore}-${input.blueScore} (${input.resultType})`,
  });

  // A completed final closes out the category.
  const finalized = await maybeFinalizeKyorugi(bout.categoryId, input.actorId);
  return { ok: true, categoryFinalized: finalized };
}

/** Withdrawal / no-show: award the bout to the opponent and cascade. */
export async function walkoverBout(
  boutId: string,
  winner: 'RED' | 'BLUE',
  reason: 'WALKOVER' | 'WITHDRAWAL',
  actorId: string,
) {
  const bout = await db.bout.findUnique({ where: { id: boutId } });
  if (!bout) return { ok: false as const, error: 'Bout not found.' };

  const loserEntryId = winner === 'RED' ? bout.blueEntryId : bout.redEntryId;
  if (loserEntryId && reason === 'WITHDRAWAL') {
    await db.entry.update({ where: { id: loserEntryId }, data: { status: 'WITHDRAWN' } });
  }

  return recordBoutResult({
    boutId,
    winner,
    resultType: reason,
    redScore: 0,
    blueScore: 0,
    actorId,
  });
}

// ---------------------------------------------------------------------------
// Finalisation → medals
// ---------------------------------------------------------------------------
async function maybeFinalizeKyorugi(categoryId: string, actorId: string): Promise<boolean> {
  const bouts = await db.bout.findMany({ where: { categoryId } });
  if (!bouts.length) return false;

  const maxRound = Math.max(...bouts.map((b) => b.round));
  const final = bouts.find((b) => b.round === maxRound && b.position === 0);
  if (!final || (final.status !== 'COMPLETED' && final.status !== 'BYE')) return false;
  if (!final.winnerEntryId) return false;

  const goldEntryId = final.winnerEntryId;
  const silverEntryId = final.redEntryId === goldEntryId ? final.blueEntryId : final.redEntryId;

  // WT standard: both semi-final losers take bronze; there is no bronze play-off.
  const semis = bouts.filter((b) => b.round === maxRound - 1);
  const bronzeEntryIds = semis
    .filter((b) => b.status === 'COMPLETED' && b.winnerEntryId)
    .map((b) => (b.redEntryId === b.winnerEntryId ? b.blueEntryId : b.redEntryId))
    .filter((id): id is string => Boolean(id));

  const everyBoutSettled = bouts.every((b) => b.status === 'COMPLETED' || b.status === 'BYE');
  if (!everyBoutSettled) return false;

  await db.$transaction(async (tx) => {
    await tx.result.deleteMany({ where: { categoryId } });

    await tx.result.create({ data: { categoryId, entryId: goldEntryId, position: 1, medal: 'GOLD' } });
    if (silverEntryId) {
      await tx.result.create({ data: { categoryId, entryId: silverEntryId, position: 2, medal: 'SILVER' } });
    }
    for (const entryId of bronzeEntryIds) {
      await tx.result.create({ data: { categoryId, entryId, position: 3, medal: 'BRONZE' } });
    }

    // Everyone else in the draw is recorded as a participant (position 0) so the
    // participation certificate run has a single source of truth.
    const medalled = new Set([goldEntryId, silverEntryId, ...bronzeEntryIds].filter(Boolean) as string[]);
    const others = await tx.entry.findMany({ where: { categoryId, id: { notIn: [...medalled] } } });
    for (const entry of others) {
      await tx.result.create({ data: { categoryId, entryId: entry.id, position: 0 } });
    }

    await tx.category.update({
      where: { id: categoryId },
      data: { finalized: true, finalizedAt: new Date(), drawStatus: 'LOCKED' },
    });
  });

  await logAudit({
    userId: actorId,
    action: 'CATEGORY_FINALIZED',
    entityType: 'Category',
    entityId: categoryId,
    detail: `Kyorugi medals awarded (1 gold, ${silverEntryId ? 1 : 0} silver, ${bronzeEntryIds.length} bronze)`,
  });

  return true;
}

/** Poomsae: compute each entry's trimmed-mean score, rank, then award medals. */
export async function finalizePoomsae(
  categoryId: string,
  actorId: string,
): Promise<{ ok: true; ranked: number } | { ok: false; error: string }> {
  const category = await db.category.findUnique({
    where: { id: categoryId },
    include: { entries: { where: { status: 'ACTIVE' }, include: { poomsaeScores: true } } },
  });
  if (!category) return { ok: false, error: 'Category not found.' };
  if (category.discipline !== 'POOMSAE') return { ok: false, error: 'This category is not a Poomsae event.' };

  const unscored = category.entries.filter((e) => e.poomsaeScores.length === 0);
  if (unscored.length) {
    return { ok: false, error: `${unscored.length} entr${unscored.length === 1 ? 'y has' : 'ies have'} no judge scores yet.` };
  }

  const computed = category.entries.map((entry) => ({
    entryId: entry.id,
    finalScore: computePoomsaeScore(
      entry.poomsaeScores.map((s) => ({
        judgeId: s.judgeId,
        accuracy: s.accuracy,
        presentation: s.presentation,
        total: s.total,
      })),
    ).finalScore,
  }));

  const ranked = rankPoomsae(computed);

  await db.$transaction(async (tx) => {
    await tx.result.deleteMany({ where: { categoryId } });

    for (const row of ranked) {
      await tx.entry.update({
        where: { id: row.entryId },
        data: { poomsaeFinalScore: row.finalScore, poomsaeRank: row.rank },
      });

      const medal = row.rank === 1 ? 'GOLD' : row.rank === 2 ? 'SILVER' : row.rank === 3 ? 'BRONZE' : null;
      await tx.result.create({
        data: {
          categoryId,
          entryId: row.entryId,
          position: row.rank <= 3 ? row.rank : 0,
          medal,
          score: row.finalScore,
        },
      });
    }

    await tx.category.update({
      where: { id: categoryId },
      data: { finalized: true, finalizedAt: new Date(), drawStatus: 'LOCKED' },
    });
  });

  await logAudit({
    userId: actorId,
    action: 'CATEGORY_FINALIZED',
    entityType: 'Category',
    entityId: categoryId,
    detail: `Poomsae ranked, ${ranked.length} entries scored`,
  });

  return { ok: true, ranked: ranked.length };
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------
export type ScheduleConflict = {
  kind: 'ATHLETE_DOUBLE_BOOKED' | 'MAT_OVERLAP' | 'REFEREE_DOUBLE_BOOKED' | 'UNSCHEDULED_DEPENDENCY';
  boutIds: string[];
  message: string;
};

const SLOT_MINUTES = 12; // nominal mat time per bout, used for overlap detection

/**
 * Flags the conflicts the spec calls out — an athlete needed on two mats at
 * once — plus mat/referee double-booking and bouts scheduled before the bout
 * that feeds them.
 */
export async function detectScheduleConflicts(eventId: string): Promise<ScheduleConflict[]> {
  const bouts = await db.bout.findMany({
    where: { scheduledAt: { not: null }, status: { not: 'BYE' }, category: { eventId } },
    include: {
      category: { select: { name: true } },
      mat: { select: { name: true } },
      redEntry: { include: { participant: { select: { id: true, name: true } } } },
      blueEntry: { include: { participant: { select: { id: true, name: true } } } },
      referee: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  const conflicts: ScheduleConflict[] = [];
  const overlaps = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) < SLOT_MINUTES * 60_000;

  for (let i = 0; i < bouts.length; i++) {
    for (let j = i + 1; j < bouts.length; j++) {
      const a = bouts[i]!;
      const b = bouts[j]!;
      if (!a.scheduledAt || !b.scheduledAt || !overlaps(a.scheduledAt, b.scheduledAt)) continue;

      const aAthletes = [a.redEntry?.participant, a.blueEntry?.participant].filter(Boolean);
      const bAthletes = [b.redEntry?.participant, b.blueEntry?.participant].filter(Boolean);
      const shared = aAthletes.find((x) => bAthletes.some((y) => y!.id === x!.id));

      if (shared && a.matId !== b.matId) {
        conflicts.push({
          kind: 'ATHLETE_DOUBLE_BOOKED',
          boutIds: [a.id, b.id],
          message: `${shared.name} is needed on ${a.mat?.name ?? 'an unassigned mat'} and ${b.mat?.name ?? 'an unassigned mat'} at the same time.`,
        });
      } else if (shared) {
        conflicts.push({
          kind: 'ATHLETE_DOUBLE_BOOKED',
          boutIds: [a.id, b.id],
          message: `${shared.name} has two bouts in the same slot on ${a.mat?.name ?? 'the same mat'}.`,
        });
      }

      if (a.matId && a.matId === b.matId) {
        conflicts.push({
          kind: 'MAT_OVERLAP',
          boutIds: [a.id, b.id],
          message: `${a.mat?.name}: bout #${a.boutNumber} and #${b.boutNumber} overlap.`,
        });
      }

      if (a.refereeId && a.refereeId === b.refereeId && a.matId !== b.matId) {
        conflicts.push({
          kind: 'REFEREE_DOUBLE_BOOKED',
          boutIds: [a.id, b.id],
          message: `${a.referee?.name} is assigned to two mats in the same slot.`,
        });
      }
    }
  }

  // A bout must not be scheduled before the bouts that supply its athletes.
  for (const bout of bouts) {
    if (!bout.nextBoutId || !bout.scheduledAt) continue;
    const next = bouts.find((b) => b.id === bout.nextBoutId);
    if (next?.scheduledAt && next.scheduledAt <= bout.scheduledAt) {
      conflicts.push({
        kind: 'UNSCHEDULED_DEPENDENCY',
        boutIds: [bout.id, next.id],
        message: `${bout.category.name}: ${next.roundLabel} is scheduled at or before the ${bout.roundLabel} that feeds it.`,
      });
    }
  }

  // De-duplicate identical messages produced by the pairwise sweep.
  const seen = new Set<string>();
  return conflicts.filter((c) => {
    const key = `${c.kind}|${[...c.boutIds].sort().join('|')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Sequential mat assignment: fills each mat round-by-round from a start time. */
export async function autoSchedule(
  eventId: string,
  startAt: Date,
  minutesPerBout = SLOT_MINUTES,
): Promise<number> {
  const mats = await db.mat.findMany({ where: { eventId, active: true }, orderBy: { sortOrder: 'asc' } });
  if (!mats.length) return 0;

  const bouts = await db.bout.findMany({
    where: { status: { in: ['SCHEDULED', 'IN_PROGRESS'] }, category: { eventId } },
    include: { category: { select: { sortOrder: true, discipline: true } } },
    orderBy: [{ round: 'asc' }, { category: { sortOrder: 'asc' } }, { position: 'asc' }],
  });

  // Cursor per mat, so mats fill evenly and earlier rounds always land first.
  const cursor = mats.map(() => new Date(startAt));
  const athleteBusy = new Map<string, Date[]>();
  let scheduled = 0;

  for (const bout of bouts) {
    // Choose the mat that frees up soonest.
    let matIdx = 0;
    for (let i = 1; i < cursor.length; i++) if (cursor[i]! < cursor[matIdx]!) matIdx = i;

    const at = new Date(cursor[matIdx]!);
    await db.bout.update({ where: { id: bout.id }, data: { matId: mats[matIdx]!.id, scheduledAt: at } });
    cursor[matIdx] = new Date(at.getTime() + minutesPerBout * 60_000);
    scheduled++;

    for (const entryId of [bout.redEntryId, bout.blueEntryId].filter(Boolean) as string[]) {
      const list = athleteBusy.get(entryId) ?? [];
      list.push(at);
      athleteBusy.set(entryId, list);
    }
  }

  await renumberBouts(eventId);
  return scheduled;
}

export { roundLabel };
