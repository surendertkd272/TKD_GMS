import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, getEventBySlug } from '@/lib/db';
import { Card, Empty, KeyValue, Notice, PageHeader, StatusBadge, TableWrap } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { AGE_CATEGORY_LABEL, type AgeCategory } from '@/lib/constants';
import { eventPath } from '@/lib/paths';

export const dynamic = 'force-dynamic';

/**
 * The target of the QR code on every accreditation card. Deliberately shows only
 * competition-facing detail — no contact numbers, no medical notes.
 */
export default async function ParticipantPublicPage({
  params,
}: {
  params: Promise<{ slug: string; code: string }>;
}) {
  const { slug, code } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  const participant = await db.participant.findFirst({
    where: { code: code.toUpperCase(), school: { eventId: event.id } },
    include: {
      school: { select: { name: true, code: true, status: true } },
      entries: {
        include: {
          category: true,
          result: true,
          redBouts: { include: { mat: true, category: true, blueEntry: { include: { participant: true } } } },
          blueBouts: { include: { mat: true, category: true, redEntry: { include: { participant: true } } } },
        },
      },
      certificates: { where: { revoked: false }, include: { category: true } },
    },
  });
  if (!participant) notFound();

  const bouts = participant.entries.flatMap((entry) => [
    ...entry.redBouts.map((b) => ({ bout: b, side: 'RED' as const, opponent: b.blueEntry?.participant.name })),
    ...entry.blueBouts.map((b) => ({ bout: b, side: 'BLUE' as const, opponent: b.redEntry?.participant.name })),
  ]);

  const visible = participant.school.status === 'APPROVED' && participant.status === 'APPROVED';

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title={participant.name}
        subtitle={
          <>
            <span className="num">{participant.code}</span> · {participant.school.name} ·{' '}
            {participant.personRole.charAt(0) + participant.personRole.slice(1).toLowerCase()}
          </>
        }
        actions={
          <Link href={eventPath(slug, 'results')} className="btn-quiet">
            All results
          </Link>
        }
      />

      <div className="space-y-6">
        {!visible ? (
          <Notice kind="warn">
            This accreditation is not active yet — the school registration is still being reviewed. Show
            this screen at the accreditation desk.
          </Notice>
        ) : (
          <Notice kind="ok">
            <strong>Accreditation valid</strong> for {event.eventName} {event.edition}. Revision{' '}
            {participant.accreditationVersion}
            {participant.accreditationIssuedAt ? `, issued ${fmtDateTime(participant.accreditationIssuedAt)}` : ''}.
          </Notice>
        )}

        <Card title="Competition record" bodyClassName="card-pad">
          <KeyValue
            rows={[
              ['Participant ID', <span className="num">{participant.code}</span>],
              ['School', `${participant.school.name} (${participant.school.code})`],
              ['Age category', AGE_CATEGORY_LABEL[participant.ageCategory as AgeCategory] ?? participant.ageCategory],
              ['Gender', participant.gender === 'MALE' ? 'Male' : 'Female'],
              ['Weight', `${participant.weightKg} kg`],
              ['Belt grade', participant.beltGrade],
              ['Accreditation', <StatusBadge status={participant.status} />],
              [
                'Weigh-in',
                participant.weighInAt
                  ? `${participant.weighInWeight} kg · ${fmtDateTime(participant.weighInAt)}`
                  : 'Not recorded',
              ],
            ]}
          />
        </Card>

        {participant.entries.length > 0 && (
          <Card title="Divisions" bodyClassName="">
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Division</th>
                    <th>Discipline</th>
                    <th>Seed</th>
                    <th>Result</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {participant.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="font-medium text-ink">{entry.category.name}</td>
                      <td className="text-xs uppercase tracking-wide text-ink-muted">
                        {entry.category.discipline.toLowerCase()}
                      </td>
                      <td className="num">{entry.seed ?? '—'}</td>
                      <td>
                        {entry.result?.medal ? (
                          <StatusBadge status={entry.result.medal} />
                        ) : entry.result ? (
                          <span className="text-ink-muted">Participated</span>
                        ) : (
                          <StatusBadge status={entry.category.drawStatus} />
                        )}
                      </td>
                      <td className="text-right">
                        {entry.category.drawStatus === 'PUBLISHED' || entry.category.drawStatus === 'LOCKED' ? (
                          <Link href={eventPath(slug, `results/${entry.categoryId}`)} className="btn-ghost btn-sm">
                            Bracket
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        )}

        {bouts.length > 0 ? (
          <Card title="Bouts" bodyClassName="">
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Division</th>
                    <th>Round</th>
                    <th>Corner</th>
                    <th>Opponent</th>
                    <th>Mat / time</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {bouts.map(({ bout, side, opponent }) => {
                    const won =
                      bout.winnerEntryId != null &&
                      ((side === 'RED' && bout.winnerEntryId === bout.redEntryId) ||
                        (side === 'BLUE' && bout.winnerEntryId === bout.blueEntryId));
                    return (
                      <tr key={`${bout.id}-${side}`}>
                        <td className="text-xs">{bout.category.name}</td>
                        <td className="whitespace-nowrap text-xs">{bout.roundLabel}</td>
                        <td className={side === 'RED' ? 'text-tkd-red' : 'text-tkd-blue'}>{side}</td>
                        <td>{opponent ?? 'TBD'}</td>
                        <td className="whitespace-nowrap text-xs">
                          {bout.mat?.name ?? '—'}
                          {bout.scheduledAt ? ` · ${fmtDateTime(bout.scheduledAt)}` : ''}
                        </td>
                        <td className="whitespace-nowrap">
                          {bout.status === 'COMPLETED' ? (
                            <>
                              <span className={won ? 'badge-green' : 'badge-neutral'}>{won ? 'Won' : 'Lost'}</span>
                              <span className="num ml-2">
                                {bout.redScore}–{bout.blueScore}
                              </span>
                            </>
                          ) : (
                            <StatusBadge status={bout.status} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        ) : (
          participant.personRole === 'ATHLETE' && (
            <Empty title="No bouts published yet" hint="Bouts appear once the draw for this athlete's division is published." />
          )
        )}

        {participant.certificates.length > 0 && (
          <Card title="Certificates" subtitle="Verifiable against the official record." bodyClassName="">
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Certificate no.</th>
                    <th>Type</th>
                    <th>Division</th>
                    <th>Medal</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {participant.certificates.map((cert) => (
                    <tr key={cert.id}>
                      <td className="num text-xs">{cert.certNo}</td>
                      <td>{cert.type === 'WINNER' ? 'Merit' : 'Participation'}</td>
                      <td className="text-xs">{cert.category?.name ?? '—'}</td>
                      <td>{cert.medal ? <StatusBadge status={cert.medal} /> : '—'}</td>
                      <td className="text-right">
                        <Link href={eventPath(slug, `verify/${cert.certNo}`)} className="btn-ghost btn-sm">
                          Verify
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        )}
      </div>
    </div>
  );
}
