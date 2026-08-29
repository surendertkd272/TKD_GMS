import Link from 'next/link';
import { db, getSettings } from '@/lib/db';
import { championSchool, eventStats, medalTally } from '@/lib/medals';
import { Card, MedalPips, StatusBadge, TableWrap } from '@/components/ui';
import { fmtDate, fmtDateTime, money } from '@/lib/format';
import { AGE_CATEGORY_LABEL, type AgeCategory } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function PublicHome() {
  const settings = await getSettings();

  const [stats, tally, champion, recent, upcoming, categoryCounts] = await Promise.all([
    eventStats(),
    medalTally(),
    championSchool(),
    db.bout.findMany({
      where: { status: 'COMPLETED', category: { drawStatus: { in: ['PUBLISHED', 'LOCKED'] } } },
      include: {
        category: { select: { id: true, name: true } },
        redEntry: { include: { participant: { include: { school: { select: { code: true } } } } } },
        blueEntry: { include: { participant: { include: { school: { select: { code: true } } } } } },
      },
      orderBy: { completedAt: 'desc' },
      take: 8,
    }),
    db.bout.findMany({
      where: {
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
        scheduledAt: { not: null },
        category: { drawStatus: { in: ['PUBLISHED', 'LOCKED'] } },
      },
      include: {
        category: { select: { name: true } },
        mat: { select: { name: true } },
        redEntry: { include: { participant: { include: { school: { select: { code: true } } } } } },
        blueEntry: { include: { participant: { include: { school: { select: { code: true } } } } } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 8,
    }),
    db.category.groupBy({
      by: ['ageCategory'],
      where: { active: true, entries: { some: {} } },
      _count: true,
    }),
  ]);

  const registrationOpen = !settings.registrationLocked && settings.registrationClosesAt > new Date();
  const showResults = settings.resultsPublished;

  return (
    <>
      {/* ---- Hero ---- */}
      <section className="border-b border-surface-line bg-ink">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="eyebrow text-white/50">{settings.organiser}</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
            {settings.eventName}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/70">
            Kyorugi and Poomsae across Youth, Cadet and Junior categories. Live draws, live scoring and a
            live medal tally — no login needed to follow along.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {registrationOpen ? (
              <Link href="/register-school" className="btn-primary">
                Register your school
              </Link>
            ) : (
              <Link href="/results" className="btn-primary">
                Live results
              </Link>
            )}
            <Link
              href="/schedule"
              className="btn inline-flex border border-white/25 text-white hover:bg-white/10 focus:ring-white/30"
            >
              Event schedule
            </Link>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/10 pt-6 sm:mt-12 sm:gap-x-8 sm:gap-y-6 sm:pt-8 lg:grid-cols-4">
            {[
              ['Venue', settings.venue],
              ['Dates', `${fmtDate(settings.startDate)} – ${fmtDate(settings.endDate)}`],
              [
                'Entries',
                registrationOpen ? `Close ${fmtDate(settings.registrationClosesAt)}` : 'Closed',
              ],
              ['Entry fee', `${money(settings.feePerParticipant)} per athlete`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/40">{label}</dt>
                <dd className="mt-1 text-sm text-white/90">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---- Numbers ---- */}
      <section className="border-b border-surface-line bg-surface-sunk">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px overflow-hidden px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
          {[
            ['Schools', stats.approvedSchools],
            ['Athletes', stats.athletes],
            ['Divisions in play', stats.categories],
            ['Medals decided', stats.medals],
          ].map(([label, value]) => (
            <div key={String(label)} className="py-8 text-center">
              <p className="text-3xl font-semibold tabular-nums tracking-tight text-ink">{value}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            {showResults && recent.length > 0 && (
              <Card
                title="Latest results"
                subtitle="Updated the moment a mat official submits a bout."
                actions={
                  <Link href="/results" className="btn-ghost btn-sm">
                    All results
                  </Link>
                }
                bodyClassName=""
              >
                <TableWrap>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Division</th>
                        <th>Round</th>
                        <th>Winner</th>
                        <th>Score</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((bout) => {
                        const winnerIsRed = bout.winnerEntryId === bout.redEntryId;
                        const winner = winnerIsRed ? bout.redEntry : bout.blueEntry;
                        const loser = winnerIsRed ? bout.blueEntry : bout.redEntry;
                        return (
                          <tr key={bout.id}>
                            <td className="text-ink">{bout.category.name}</td>
                            <td className="whitespace-nowrap text-xs">{bout.roundLabel}</td>
                            <td>
                              <span className="font-medium text-ink">{winner?.participant.name ?? '—'}</span>
                              <span className="block text-xs text-ink-muted">
                                beat {loser?.participant.name ?? '—'} ({loser?.participant.school.code ?? '—'})
                              </span>
                            </td>
                            <td className="num whitespace-nowrap">
                              {bout.redScore}–{bout.blueScore}
                            </td>
                            <td className="text-right">
                              <Link href={`/results/${bout.category.id}`} className="btn-quiet btn-sm">
                                Bracket
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrap>
              </Card>
            )}

            {upcoming.length > 0 && (
              <Card
                title="Coming up"
                subtitle="Next bouts across all mats."
                actions={
                  <Link href="/schedule" className="btn-ghost btn-sm">
                    Full schedule
                  </Link>
                }
                bodyClassName=""
              >
                <TableWrap>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Mat</th>
                        <th>Division</th>
                        <th>Bout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcoming.map((bout) => (
                        <tr key={bout.id}>
                          <td className="num whitespace-nowrap">{fmtDateTime(bout.scheduledAt)}</td>
                          <td className="whitespace-nowrap">{bout.mat?.name ?? '—'}</td>
                          <td className="text-ink">{bout.category.name}</td>
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
              </Card>
            )}

            <Card title="Categories" subtitle="Age categories are calculated from date of birth on the reference date.">
              <ul className="space-y-4">
                {(['YOUTH', 'CADET', 'JUNIOR'] as AgeCategory[]).map((category) => {
                  const count = categoryCounts.find((c) => c.ageCategory === category)?._count ?? 0;
                  return (
                    <li key={category} className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-ink">{AGE_CATEGORY_LABEL[category]}</p>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          Kyorugi weight divisions and individual Poomsae, split by gender.
                        </p>
                      </div>
                      <span className="num shrink-0 text-sm text-ink-soft">
                        {count} division{count === 1 ? '' : 's'} in play
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-5 border-t border-surface-line pt-4 text-xs leading-relaxed text-ink-muted">
                Age is measured on {fmtDate(settings.ageReferenceDate)}. Youth is 11 &amp; under, Cadet
                12–14, Junior 15–17.
              </p>
            </Card>
          </div>

          <div className="space-y-8">
            {showResults && champion && (
              <Card title="Champion school" subtitle="Weighted points across both events.">
                <p className="text-xl font-semibold tracking-tight text-ink">{champion.schoolName}</p>
                <p className="mt-1 text-sm text-ink-muted">{champion.points} points</p>
                <div className="mt-3">
                  <MedalPips gold={champion.gold} silver={champion.silver} bronze={champion.bronze} />
                </div>
              </Card>
            )}

            {showResults && tally.rows.length > 0 && (
              <Card
                title="Medal tally"
                actions={
                  <Link href="/medal-tally" className="btn-ghost btn-sm">
                    Full table
                  </Link>
                }
                bodyClassName=""
              >
                <ul className="divide-y divide-surface-line">
                  {tally.rows.slice(0, 8).map((row) => (
                    <li key={row.schoolId} className="flex items-center justify-between gap-3 px-5 py-3">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="num w-5 shrink-0 text-xs text-ink-muted">{row.rank}</span>
                        <span className="truncate text-sm text-ink">{row.schoolName}</span>
                      </span>
                      <MedalPips gold={row.gold} silver={row.silver} bronze={row.bronze} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card title="For schools">
              <p className="text-sm leading-relaxed text-ink-soft">
                Register once, then enter your squad participant by participant or with a single CSV
                upload. Age categories are calculated for you, accreditation cards generate on approval,
                and certificates arrive by email when results are final.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {registrationOpen ? (
                  <Link href="/register-school" className="btn-primary btn-sm">
                    Register a school
                  </Link>
                ) : null}
                <Link href="/login" className="btn-ghost btn-sm">
                  School sign in
                </Link>
              </div>
            </Card>

            <Card title="Draws">
              <p className="text-sm leading-relaxed text-ink-soft">
                {settings.drawsPublished
                  ? 'Draws are published. Brackets update live as bouts complete.'
                  : 'Draws are generated once registration closes, then published here and to every school at the same moment.'}
              </p>
              <div className="mt-3">
                <StatusBadge status={settings.drawsPublished ? 'PUBLISHED' : 'DRAFT'} />
              </div>
              <Link href="/results" className="btn-ghost btn-sm mt-4">
                Browse divisions
              </Link>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
