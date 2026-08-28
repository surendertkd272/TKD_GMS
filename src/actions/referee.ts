'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { logAudit, requireReferee } from '@/lib/auth';
import { recordBoutResult } from '@/lib/tournament';
import { validateJudgeScore } from '@/lib/poomsae';

export type RefereeState = { ok?: boolean; error?: string; message?: string } | null;

/** A referee may only touch bouts on the mat they are signed in against. */
async function authoriseBout(boutId: string) {
  const { session, user } = await requireReferee();

  const bout = await db.bout.findUnique({
    where: { id: boutId },
    include: {
      category: true,
      mat: true,
      redEntry: { include: { participant: true } },
      blueEntry: { include: { participant: true } },
    },
  });
  if (!bout) return { error: 'Bout not found.' as const };

  const assignedToMe = bout.refereeId === session.userId;
  const onMyMat = user.assignedMatId != null && bout.matId === user.assignedMatId;
  if (!assignedToMe && !onMyMat) {
    return { error: 'That bout is not on your assigned mat.' as const };
  }

  return { session, user, bout };
}

export async function startBout(formData: FormData): Promise<void> {
  const boutId = String(formData.get('boutId') ?? '');
  const auth = await authoriseBout(boutId);
  if ('error' in auth) return;

  await db.bout.update({
    where: { id: boutId },
    data: { status: 'IN_PROGRESS', startedAt: new Date() },
  });

  await logAudit({
    userId: auth.session.userId,
    action: 'BOUT_STARTED',
    entityType: 'Bout',
    entityId: boutId,
    detail: `${auth.bout.category.name} ${auth.bout.roundLabel}`,
  });

  revalidatePath('/mat');
  revalidatePath(`/mat/bout/${boutId}`);
  redirect(`/mat/bout/${boutId}`);
}

export async function submitKyorugiResult(_prev: RefereeState, formData: FormData): Promise<RefereeState> {
  const boutId = String(formData.get('boutId') ?? '');
  const auth = await authoriseBout(boutId);
  if ('error' in auth) return { error: auth.error };

  const winner = String(formData.get('winner') ?? '') as 'RED' | 'BLUE';
  if (winner !== 'RED' && winner !== 'BLUE') return { error: 'Select the winning corner before submitting.' };

  const resultType = String(formData.get('resultType') ?? 'POINTS');

  // Round-by-round entry: rounds[n][red|blue|redGam|blueGam]
  const rounds: { roundNo: number; redPoints: number; bluePoints: number; redGamJeom: number; blueGamJeom: number }[] = [];
  for (let roundNo = 1; roundNo <= 4; roundNo++) {
    const red = Number.parseInt(String(formData.get(`r${roundNo}_red`) ?? ''), 10);
    const blue = Number.parseInt(String(formData.get(`r${roundNo}_blue`) ?? ''), 10);
    const redGam = Number.parseInt(String(formData.get(`r${roundNo}_redGam`) ?? '0'), 10) || 0;
    const blueGam = Number.parseInt(String(formData.get(`r${roundNo}_blueGam`) ?? '0'), 10) || 0;

    const played = String(formData.get(`r${roundNo}_played`) ?? '') === '1';
    if (!played) continue;
    if (!Number.isFinite(red) || !Number.isFinite(blue) || red < 0 || blue < 0) {
      return { error: `Round ${roundNo} has an invalid score.` };
    }
    rounds.push({ roundNo, redPoints: red, bluePoints: blue, redGamJeom: redGam, blueGamJeom: blueGam });
  }

  const isWalkover = resultType === 'WALKOVER' || resultType === 'WITHDRAWAL';
  if (!rounds.length && !isWalkover) {
    return { error: 'Enter at least one round, or record a walkover / withdrawal.' };
  }

  const redScore = rounds.reduce((sum, r) => sum + r.redPoints, 0);
  const blueScore = rounds.reduce((sum, r) => sum + r.bluePoints, 0);

  const result = await recordBoutResult({
    boutId,
    winner,
    resultType,
    redScore,
    blueScore,
    redGamJeom: rounds.reduce((sum, r) => sum + r.redGamJeom, 0),
    blueGamJeom: rounds.reduce((sum, r) => sum + r.blueGamJeom, 0),
    rounds,
    actorId: auth.session.userId,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath('/mat');
  revalidatePath('/results');
  revalidatePath('/medal-tally');

  redirect(
    `/mat?submitted=${encodeURIComponent(
      result.categoryFinalized
        ? `Result recorded. ${auth.bout.category.name} is complete — medals are on the tally.`
        : 'Result recorded and the winner advanced. Next bout is ready.',
    )}`,
  );
}

export async function flagDispute(_prev: RefereeState, formData: FormData): Promise<RefereeState> {
  const boutId = String(formData.get('boutId') ?? '');
  const auth = await authoriseBout(boutId);
  if ('error' in auth) return { error: auth.error };

  const note = String(formData.get('note') ?? '').trim();
  if (!note) return { error: 'Describe what needs reviewing.' };

  await db.bout.update({ where: { id: boutId }, data: { disputeFlag: true, disputeNote: note } });

  await logAudit({
    userId: auth.session.userId,
    action: 'DISPUTE_RAISED',
    entityType: 'Bout',
    entityId: boutId,
    detail: note,
  });

  revalidatePath('/mat');
  revalidatePath('/admin/live');
  return { ok: true, message: 'Flagged for the Technical Director. They can see it on live control now.' };
}

/**
 * Each judge submits independently — one score row per judge per entry, upserted
 * so a correction replaces rather than duplicates.
 */
export async function submitPoomsaeScore(_prev: RefereeState, formData: FormData): Promise<RefereeState> {
  const { session, user } = await requireReferee();
  if (!user.isJury) return { error: 'Your account is not on the Poomsae jury panel.' };

  const entryId = String(formData.get('entryId') ?? '');
  const accuracy = Number.parseFloat(String(formData.get('accuracy') ?? ''));
  const presentation = Number.parseFloat(String(formData.get('presentation') ?? ''));
  const note = String(formData.get('note') ?? '').trim();

  const invalid = validateJudgeScore(accuracy, presentation);
  if (invalid) return { error: invalid };

  const entry = await db.entry.findUnique({
    where: { id: entryId },
    include: { category: true, participant: { select: { name: true } } },
  });
  if (!entry) return { error: 'Entry not found.' };
  if (entry.category.finalized) return { error: 'That category is already finalised.' };

  const total = Math.round((accuracy + presentation) * 100) / 100;

  await db.poomsaeScore.upsert({
    where: { entryId_judgeId: { entryId, judgeId: session.userId } },
    update: { accuracy, presentation, total, note: note || null, submittedAt: new Date() },
    create: { entryId, judgeId: session.userId, accuracy, presentation, total, note: note || null },
  });

  await logAudit({
    userId: session.userId,
    action: 'POOMSAE_SCORED',
    entityType: 'Entry',
    entityId: entryId,
    detail: `${entry.participant.name}: ${accuracy.toFixed(1)} + ${presentation.toFixed(1)} = ${total.toFixed(2)}`,
  });

  revalidatePath(`/mat/poomsae/${entry.categoryId}`);
  revalidatePath('/admin/live');
  return { ok: true, message: `Scored ${entry.participant.name} — ${total.toFixed(2)} / 10.00.` };
}
