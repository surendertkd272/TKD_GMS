import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db, getEventById } from '@/lib/db';
import { fmtDateTime } from '@/lib/format';
import { AGE_CATEGORY_SHORT, type AgeCategory } from '@/lib/constants';
import { PrintButton } from '@/components/PrintButton';

export const metadata = { title: 'Print brackets' };
export const dynamic = 'force-dynamic';

type EntryRow = {
  id: string;
  seed: number | null;
  participant: { name: string; school: { code: string; name: string } };
};

function EntryListTable({ entries }: { entries: EntryRow[] }) {
  return (
    <table className="print-table">
      <thead>
        <tr>
          <th>Seed</th>
          <th>Athlete</th>
          <th>School</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id}>
            <td className="num">{entry.seed ?? '—'}</td>
            <td>{entry.participant.name}</td>
            <td>
              {entry.participant.school.code} — {entry.participant.school.name}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PoomsaeSheet({ entries, judgeCols }: { entries: EntryRow[]; judgeCols: number }) {
  const judges = Array.from({ length: judgeCols }, (_, i) => i + 1);
  return (
    <table className="print-table">
      <thead>
        <tr>
          <th>Order</th>
          <th>Athlete</th>
          <th>School</th>
          {judges.map((j) => (
            <th key={j}>
              Judge {j}
              <br />
              Acc /4 · Pres /6
            </th>
          ))}
          <th>Total</th>
          <th>Rank</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id}>
            <td className="num">{entry.seed ?? '—'}</td>
            <td>{entry.participant.name}</td>
            <td>{entry.participant.school.code}</td>
            {judges.map((j) => (
              <td key={j} className="whitespace-nowrap">
                <span className="print-blank" style={{ minWidth: '2rem' }} /> /
                <span className="print-blank" style={{ minWidth: '2rem' }} />
              </td>
            ))}
            <td>
              <span className="print-blank" />
            </td>
            <td>
              <span className="print-blank" style={{ minWidth: '2rem' }} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function PrintDrawsPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ categoryId?: string }>;
}) {
  await requireAdmin();
  const [{ eventId }, { categoryId }] = await Promise.all([params, searchParams]);
  const event = await getEventById(eventId);
  if (!event) notFound();

  const [categories, judgeCount] = await Promise.all([
    db.category.findMany({
      where: {
        eventId,
        active: true,
        entries: { some: {} },
        ...(categoryId ? { id: categoryId } : {}),
      },
      include: {
        entries: {
          include: { participant: { include: { school: { select: { code: true, name: true } } } } },
          orderBy: [{ seed: 'asc' }, { participant: { name: 'asc' } }],
        },
        bouts: {
          include: {
            mat: { select: { name: true } },
            redEntry: { include: { participant: { include: { school: { select: { code: true } } } } } },
            blueEntry: { include: { participant: { include: { school: { select: { code: true } } } } } },
          },
          orderBy: [{ round: 'asc' }, { position: 'asc' }],
        },
      },
      orderBy: [{ discipline: 'asc' }, { sortOrder: 'asc' }],
    }),
    db.user.count({ where: { eventId, role: 'REFEREE', isJury: true, active: true } }),
  ]);

  const judgeCols = Math.max(3, Math.min(judgeCount || 3, 7));
  const printedAt = fmtDateTime(new Date());

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Printable brackets</h1>
          <p className="page-sub">
            Paper fallback for every division with entries — blank score, winner and judging columns to
            fill by hand if the system is unavailable. One division per page.
          </p>
        </div>
        <PrintButton label={categoryId ? 'Print this division' : 'Print all divisions'} />
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-ink-muted">No divisions with entries yet.</p>
      ) : (
        categories.map((category) => (
          <section key={category.id} className="print-sheet mb-10 break-after-page">
            <div className="print-sheet-header">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-muted">
                  {event.eventName} · {event.edition}
                </p>
                <h2 className="text-xl font-semibold text-ink">{category.name}</h2>
                <p className="text-sm text-ink-soft">
                  <span className="num">{category.code}</span> · {category.discipline} ·{' '}
                  {AGE_CATEGORY_SHORT[category.ageCategory as AgeCategory] ?? category.ageCategory} ·{' '}
                  {category.gender}
                  {category.weightLabel ? ` · ${category.weightLabel}` : ''}
                </p>
              </div>
              <div className="text-right text-xs text-ink-muted">
                <p>Printed {printedAt}</p>
                <p>{category.entries.length} entries</p>
              </div>
            </div>

            {category.discipline === 'KYORUGI' ? (
              category.bouts.length > 0 ? (
                [...new Set(category.bouts.map((b) => b.round))]
                  .sort((a, b) => a - b)
                  .map((round) => {
                    const inRound = category.bouts.filter((b) => b.round === round);
                    return (
                      <div key={round} className="mb-5">
                        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink">
                          {inRound[0]?.roundLabel ?? `Round ${round}`}
                        </h3>
                        <table className="print-table">
                          <thead>
                            <tr>
                              <th>Bout</th>
                              <th>Red corner</th>
                              <th>Blue corner</th>
                              <th>Mat / time</th>
                              <th>Score</th>
                              <th>Winner</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inRound.map((bout) => (
                              <tr key={bout.id}>
                                <td className="num">{bout.boutNumber || '—'}</td>
                                <td>
                                  {bout.redEntry
                                    ? `${bout.redEntry.participant.name} (${bout.redEntry.participant.school.code})`
                                    : bout.status === 'BYE'
                                      ? '— (bye)'
                                      : 'TBD'}
                                </td>
                                <td>
                                  {bout.blueEntry
                                    ? `${bout.blueEntry.participant.name} (${bout.blueEntry.participant.school.code})`
                                    : bout.status === 'BYE'
                                      ? '— (bye)'
                                      : 'TBD'}
                                </td>
                                <td className="whitespace-nowrap text-xs">
                                  {bout.mat?.name ?? ''} {bout.scheduledAt ? fmtDateTime(bout.scheduledAt) : ''}
                                </td>
                                <td className="whitespace-nowrap">
                                  <span className="print-blank" /> – <span className="print-blank" />
                                </td>
                                <td className="whitespace-nowrap text-xs">○ Red &nbsp; ○ Blue</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })
              ) : (
                <>
                  <p className="mb-3 text-sm italic text-ink-muted">
                    Draw not yet generated — entry list below.
                  </p>
                  <EntryListTable entries={category.entries} />
                </>
              )
            ) : (
              <PoomsaeSheet entries={category.entries} judgeCols={judgeCols} />
            )}
          </section>
        ))
      )}
    </div>
  );
}
