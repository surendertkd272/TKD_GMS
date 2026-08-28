import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireReferee } from '@/lib/auth';
import { db } from '@/lib/db';
import { Card, KeyValue, Notice, PageHeader, StatusBadge } from '@/components/ui';
import { fmtTime } from '@/lib/format';
import { KyorugiScorer } from './KyorugiScorer';
import { DisputeForm } from './DisputeForm';

export const dynamic = 'force-dynamic';

export default async function MatBoutPage({ params }: { params: Promise<{ boutId: string }> }) {
  const [{ session, user }, { boutId }] = await Promise.all([requireReferee(), params]);

  const bout = await db.bout.findUnique({
    where: { id: boutId },
    include: {
      category: true,
      mat: true,
      rounds: { orderBy: { roundNo: 'asc' } },
      redEntry: { include: { participant: { include: { school: { select: { code: true } } } } } },
      blueEntry: { include: { participant: { include: { school: { select: { code: true } } } } } },
    },
  });
  if (!bout) notFound();

  const authorised = bout.refereeId === session.userId || (user.assignedMatId && bout.matId === user.assignedMatId);
  if (!authorised) {
    return (
      <>
        <PageHeader title="Not your mat" subtitle="Scoring access is scoped to the mat you are assigned to." />
        <Notice kind="error">
          This bout is on {bout.mat?.name ?? 'another mat'}. You are assigned to{' '}
          {user.assignedMat?.name ?? 'no mat'}.{' '}
          <Link href="/mat" className="font-medium underline">
            Back to your queue
          </Link>
        </Notice>
      </>
    );
  }

  const toCorner = (entry: typeof bout.redEntry) =>
    entry
      ? {
          name: entry.participant.name,
          school: entry.participant.school.code,
          weight: entry.participant.weightKg,
          belt: entry.participant.beltGrade,
        }
      : null;

  return (
    <>
      <PageHeader
        title={`${bout.category.name} — ${bout.roundLabel}`}
        subtitle={
          <>
            {bout.boutNumber ? `Bout #${bout.boutNumber} · ` : ''}
            {bout.mat?.name ?? 'No mat'}
            {bout.scheduledAt ? ` · ${fmtTime(bout.scheduledAt)}` : ''} · <StatusBadge status={bout.status} />
          </>
        }
        actions={
          <Link href="/mat" className="btn-quiet">
            Back to queue
          </Link>
        }
      />

      <div className="space-y-6">
        {bout.status === 'COMPLETED' && (
          <Notice kind="warn">
            This bout is already recorded as {bout.redScore}–{bout.blueScore}. Submitting again overwrites
            the result — use it only to correct a mis-entry, and flag the bout for the Technical Director
            if the outcome itself is in question.
          </Notice>
        )}

        {(!bout.redEntryId || !bout.blueEntryId) && bout.status !== 'COMPLETED' && (
          <Notice kind="warn">
            One corner is still open — the feeding bout has not finished. You can record a walkover if the
            named athlete does not appear.
          </Notice>
        )}

        {bout.category.event === 'POOMSAE' ? (
          <Notice kind="info">
            This is a Poomsae category — scoring happens on the{' '}
            <Link href={`/mat/poomsae/${bout.categoryId}`} className="font-medium underline">
              Poomsae judging panel
            </Link>
            , where each judge submits independently.
          </Notice>
        ) : (
          <KyorugiScorer
            boutId={bout.id}
            red={toCorner(bout.redEntry)}
            blue={toCorner(bout.blueEntry)}
            categoryName={bout.category.name}
            roundLabel={bout.roundLabel}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <DisputeForm boutId={bout.id} />

          <Card title="Bout record" bodyClassName="card-pad">
            <KeyValue
              rows={[
                ['Category', bout.category.name],
                ['Round', bout.roundLabel],
                ['Mat', bout.mat?.name ?? '—'],
                ['Scheduled', bout.scheduledAt ? fmtTime(bout.scheduledAt) : 'Not scheduled'],
                [
                  'Rounds recorded',
                  bout.rounds.length
                    ? bout.rounds.map((r) => `R${r.roundNo} ${r.redPoints}–${r.bluePoints}`).join(' · ')
                    : 'None yet',
                ],
                ['Result', bout.resultType ? `${bout.resultType} (${bout.redScore}–${bout.blueScore})` : 'Not recorded'],
              ]}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
