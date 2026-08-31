import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db, getEventById } from '@/lib/db';
import { fmtDateTime } from '@/lib/format';
import { RESULT_TYPES, RESULT_TYPE_LABEL, type ResultType } from '@/lib/constants';
import { PrintButton } from '@/components/PrintButton';

export const metadata = { title: 'Print scoring sheets' };
export const dynamic = 'force-dynamic';

const ROUND_ROWS = ['Round 1', 'Round 2', 'Round 3', 'Golden point'];

export default async function PrintScoringSheetsPage({
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

  const [bouts] = await Promise.all([
    db.bout.findMany({
      where: {
        status: { not: 'BYE' },
        category: { eventId, discipline: 'KYORUGI', ...(categoryId ? { id: categoryId } : {}) },
      },
      include: {
        category: { select: { name: true, code: true } },
        mat: { select: { name: true } },
        redEntry: { include: { participant: { include: { school: { select: { code: true, name: true } } } } } },
        blueEntry: { include: { participant: { include: { school: { select: { code: true, name: true } } } } } },
      },
      orderBy: [{ boutNumber: 'asc' }, { category: { sortOrder: 'asc' } }, { round: 'asc' }, { position: 'asc' }],
    }),
  ]);

  const printedAt = fmtDateTime(new Date());

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Printable scoring sheets</h1>
          <p className="page-sub">
            Paper fallback for Kyorugi bouts — one full sheet per bout with a round-by-round scoring grid,
            to fill by hand if the system is unavailable. Hand referees their mat's stack before the day
            starts.
          </p>
        </div>
        <PrintButton label={categoryId ? "Print this division's sheets" : 'Print all sheets'} />
      </div>

      {bouts.length === 0 ? (
        <p className="text-sm text-ink-muted">No Kyorugi bouts to print yet.</p>
      ) : (
        bouts.map((bout) => (
          <section key={bout.id} className="print-sheet mb-10 break-after-page">
            <div className="print-sheet-header">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-muted">
                  {event.eventName} · {event.edition} · Official scoring sheet (paper backup)
                </p>
                <h2 className="text-xl font-semibold text-ink">
                  {bout.category.name} · {bout.roundLabel}
                </h2>
                <p className="text-sm text-ink-soft">
                  <span className="num">{bout.category.code}</span>
                  {bout.boutNumber ? ` · Bout #${bout.boutNumber}` : ''}
                  {bout.mat?.name ? ` · ${bout.mat.name}` : ''}
                  {bout.scheduledAt ? ` · ${fmtDateTime(bout.scheduledAt)}` : ''}
                </p>
              </div>
              <p className="text-right text-xs text-ink-muted">Printed {printedAt}</p>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-6">
              <div className="border border-ink/60 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Red corner</p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {bout.redEntry?.participant.name ?? 'TBD'}
                </p>
                <p className="text-sm text-ink-soft">{bout.redEntry?.participant.school.name ?? ''}</p>
              </div>
              <div className="border border-ink/60 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Blue corner</p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {bout.blueEntry?.participant.name ?? 'TBD'}
                </p>
                <p className="text-sm text-ink-soft">{bout.blueEntry?.participant.school.name ?? ''}</p>
              </div>
            </div>

            <table className="print-table mb-5">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Red points</th>
                  <th>Blue points</th>
                  <th>Red gam-jeom</th>
                  <th>Blue gam-jeom</th>
                  <th>Round winner</th>
                </tr>
              </thead>
              <tbody>
                {ROUND_ROWS.map((label) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td className="h-12" />
                    <td className="h-12" />
                    <td className="h-12" />
                    <td className="h-12" />
                    <td className="whitespace-nowrap text-xs">○ Red &nbsp; ○ Blue &nbsp; ○ Tie</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mb-5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                How the bout was decided
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {RESULT_TYPES.map((type) => (
                  <span key={type} className="whitespace-nowrap">
                    ○ {RESULT_TYPE_LABEL[type as ResultType]}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Winner</p>
                <p className="mt-2 text-sm">
                  ○ Red corner &nbsp;&nbsp;&nbsp; ○ Blue corner
                </p>
                <p className="mt-4 text-sm">
                  Final score: <span className="print-blank" /> – <span className="print-blank" />
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Referee</p>
                <p className="mt-2 text-sm">
                  Name: <span className="print-blank" style={{ minWidth: '10rem' }} />
                </p>
                <p className="mt-4 text-sm">
                  Signature: <span className="print-blank" style={{ minWidth: '10rem' }} />
                </p>
              </div>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
