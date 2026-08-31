import Link from 'next/link';
import { requireSchool } from '@/lib/auth';
import { db } from '@/lib/db';
import { schoolReadiness } from '@/lib/school-service';
import { Card, Empty, KeyValue, Notice, PageHeader, Stat, StatusBadge, TableWrap } from '@/components/ui';
import { fmtDate, fmtDateTime, money } from '@/lib/format';
import { AGE_CATEGORY_SHORT, type AgeCategory } from '@/lib/constants';
import { SubmitRegistration } from './SubmitRegistration';
import { schoolPath } from '@/lib/paths';

export const metadata = { title: 'School overview' };
export const dynamic = 'force-dynamic';

export default async function SchoolOverview({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const [{ school, event }, { welcome }] = await Promise.all([requireSchool(), searchParams]);

  const [readiness, participants, medals, upcoming] = await Promise.all([
    schoolReadiness(school.id),
    db.participant.groupBy({
      by: ['ageCategory'],
      where: { schoolId: school.id, personRole: 'ATHLETE' },
      _count: true,
    }),
    db.result.findMany({
      where: { medal: { not: null }, entry: { participant: { schoolId: school.id } } },
      include: { category: true, entry: { include: { participant: true } } },
      orderBy: { position: 'asc' },
      take: 5,
    }),
    db.bout.findMany({
      where: {
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
        scheduledAt: { not: null },
        category: { drawStatus: { in: ['PUBLISHED', 'LOCKED'] } },
        OR: [
          { redEntry: { participant: { schoolId: school.id } } },
          { blueEntry: { participant: { schoolId: school.id } } },
        ],
      },
      include: {
        category: true,
        mat: true,
        redEntry: { include: { participant: true } },
        blueEntry: { include: { participant: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 5,
    }),
  ]);

  const registrationOpen = !event.registrationLocked;
  const daysToClose = Math.ceil((event.registrationClosesAt.getTime() - Date.now()) / 86_400_000);

  return (
    <>
      <PageHeader
        title={school.name}
        subtitle={
          <>
            School code <span className="font-mono text-ink">{school.code}</span> · account{' '}
            <StatusBadge status={school.status} /> · entry fee <StatusBadge status={school.paymentStatus} />
          </>
        }
        actions={
          registrationOpen ? (
            <Link href={schoolPath(event.slug, 'participants/new')} className="btn-primary">
              Add participant
            </Link>
          ) : null
        }
      />

      <div className="space-y-6">
        {welcome && (
          <Notice kind="ok">
            <strong>Account created.</strong> Start entering participants now — the organising team
            reviews your account in parallel, and accreditation cards unlock the moment it is approved.
          </Notice>
        )}

        {school.status === 'PENDING' && (
          <Notice kind="warn">
            <strong>Awaiting approval.</strong> You can add and edit participants freely. Accreditation
            cards are released once the organising team approves this school.
          </Notice>
        )}

        {school.status === 'REJECTED' && (
          <Notice kind="error">
            <strong>Registration returned.</strong>{' '}
            {school.rejectionReason || 'Contact the organising team for details.'} Fix the entries and
            re-submit below.
          </Notice>
        )}

        {registrationOpen && daysToClose >= 0 && daysToClose <= 14 && (
          <Notice kind="warn">
            Entries close on <strong>{fmtDate(event.registrationClosesAt)}</strong> — {daysToClose}{' '}
            day{daysToClose === 1 ? '' : 's'} left. After that, draws are generated and entries lock.
          </Notice>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Participants" value={readiness.counts.participants} hint={`${readiness.counts.athletes} athletes`} />
          <Stat label="Event entries" value={readiness.counts.entries} hint="Kyorugi + Poomsae" />
          <Stat
            label="Photos on file"
            value={`${readiness.counts.withPhoto}/${readiness.counts.participants}`}
            hint="Needed for cards"
          />
          <Stat
            label="Entry fee"
            value={money(school.amountDue)}
            hint={`${money(school.amountPaid)} received`}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card
              title="Pre-submission check"
              subtitle="Duplicates and incomplete entries are flagged here before the organising team sees them."
              actions={
                readiness.issues.length === 0 ? <span className="badge-green">All clear</span> : (
                  <span className="badge-amber">{readiness.issues.length} to review</span>
                )
              }
              bodyClassName=""
            >
              {readiness.issues.length === 0 ? (
                <div className="card-pad">
                  <p className="text-sm text-ink-soft">
                    Every participant has a photo, an event entry and an emergency contact. Nothing is
                    blocking submission.
                  </p>
                </div>
              ) : (
                <TableWrap>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Participant</th>
                        <th>ID</th>
                        <th>Needs attention</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {readiness.issues.slice(0, 12).map((issue, i) => (
                        <tr key={`${issue.code}-${i}`}>
                          <td className="font-medium text-ink">{issue.label}</td>
                          <td className="num text-ink-muted">{issue.code}</td>
                          <td>{issue.issue}</td>
                          <td className="text-right">
                            {issue.participantId && (
                              <Link
                                href={schoolPath(event.slug, `participants/${issue.participantId}`)}
                                className="btn-ghost btn-sm"
                              >
                                Fix
                              </Link>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {readiness.issues.length > 12 && (
                    <p className="px-5 py-3 text-xs text-ink-muted">
                      and {readiness.issues.length - 12} more…
                    </p>
                  )}
                </TableWrap>
              )}
            </Card>

            <Card
              title="Next bouts for our athletes"
              subtitle="Appears once the organising team publishes the draws."
              bodyClassName=""
            >
              {upcoming.length === 0 ? (
                <div className="card-pad">
                  <Empty
                    title="No published bouts yet"
                    hint="Draws are generated after registration closes, then published to schools and the public page."
                  />
                </div>
              ) : (
                <TableWrap>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Mat</th>
                        <th>Category</th>
                        <th>Round</th>
                        <th>Bout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcoming.map((bout) => (
                        <tr key={bout.id}>
                          <td className="num whitespace-nowrap">{fmtDateTime(bout.scheduledAt)}</td>
                          <td>{bout.mat?.name ?? '—'}</td>
                          <td className="text-ink">{bout.category.name}</td>
                          <td>{bout.roundLabel}</td>
                          <td>
                            <span className="text-tkd-red">{bout.redEntry?.participant.name ?? 'TBD'}</span>
                            <span className="mx-1.5 text-ink-muted">vs</span>
                            <span className="text-tkd-blue">{bout.blueEntry?.participant.name ?? 'TBD'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <Card title="Submit for review">
              <p className="mb-4 text-sm leading-relaxed text-ink-soft">
                Submitting tells the organising team your squad is ready. You can keep editing
                participants until registration closes on {fmtDate(event.registrationClosesAt)}.
              </p>
              <SubmitRegistration
                submittedAt={school.submittedAt ? fmtDateTime(school.submittedAt) : null}
                disabled={!registrationOpen}
              />
            </Card>

            <Card title="Squad by age category" bodyClassName="card-pad">
              {participants.length === 0 ? (
                <p className="text-sm text-ink-muted">No athletes entered yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {participants.map((group) => (
                    <li key={group.ageCategory} className="flex items-center justify-between text-sm">
                      <span className="text-ink-soft">
                        {AGE_CATEGORY_SHORT[group.ageCategory as AgeCategory] ?? group.ageCategory}
                      </span>
                      <span className="num font-semibold text-ink">{group._count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {medals.length > 0 && (
              <Card title="Medals so far" bodyClassName="card-pad">
                <ul className="space-y-3">
                  {medals.map((result) => (
                    <li key={result.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {result.entry.participant.name}
                        </p>
                        <p className="truncate text-xs text-ink-muted">{result.category.name}</p>
                      </div>
                      <StatusBadge status={result.medal!} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card title="Institution on file" bodyClassName="card-pad">
              <KeyValue
                rows={[
                  ['Board', school.boardAffiliation ?? '—'],
                  ['Principal', school.principalName ?? '—'],
                  ['Coach', school.coachName ?? '—'],
                  ['Contact', school.contactEmail],
                ]}
              />
              <Link href={schoolPath(event.slug, 'profile')} className="btn-ghost btn-sm mt-4">
                Edit details
              </Link>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
