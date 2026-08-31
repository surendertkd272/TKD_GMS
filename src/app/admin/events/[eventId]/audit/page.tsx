import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db, getEventById } from '@/lib/db';
import { Card, Empty, PageHeader, TableWrap } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';

export const metadata = { title: 'Audit trail' };
export const dynamic = 'force-dynamic';

export default async function AdminAuditPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  await requireAdmin();
  const [{ eventId }, params] = await Promise.all([routeParams, searchParams]);
  const event = await getEventById(eventId);
  if (!event) notFound();

  const [logs, actions] = await Promise.all([
    db.auditLog.findMany({
      where: { eventId, ...(params.action ? { action: params.action } : {}) },
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 250,
    }),
    db.auditLog.groupBy({ by: ['action'], where: { eventId }, _count: true, orderBy: { action: 'asc' } }),
  ]);

  return (
    <>
      <PageHeader
        title="Audit trail"
        subtitle="Who changed what, and when — the record that settles a dispute over a draw, a result or an approval."
      />

      <div className="space-y-5">
        <Card bodyClassName="card-pad">
          <form className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <select name="action" defaultValue={params.action ?? ''} className="select">
              <option value="">All actions</option>
              {actions.map((entry) => (
                <option key={entry.action} value={entry.action}>
                  {entry.action.replace(/_/g, ' ').toLowerCase()} ({entry._count})
                </option>
              ))}
            </select>
            <button type="submit" className="btn-dark">
              Filter
            </button>
          </form>
        </Card>

        {logs.length === 0 ? (
          <Empty title="Nothing logged yet" hint="Approvals, draws, results, overrides and dispatches all appear here." />
        ) : (
          <Card
            title={`${logs.length} entr${logs.length === 1 ? 'y' : 'ies'}`}
            subtitle={logs.length === 250 ? 'Showing the 250 most recent.' : undefined}
            bodyClassName=""
          >
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="whitespace-nowrap text-xs text-ink-muted">{fmtDateTime(log.createdAt)}</td>
                      <td className="whitespace-nowrap text-xs">
                        {log.user ? (
                          <>
                            {log.user.name}
                            <span className="block text-ink-muted">{log.user.role.replace(/_/g, ' ').toLowerCase()}</span>
                          </>
                        ) : (
                          <span className="text-ink-muted">system</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="badge-neutral">{log.action.replace(/_/g, ' ').toLowerCase()}</span>
                      </td>
                      <td className="text-xs">{log.entityType}</td>
                      <td className="text-xs">{log.detail ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        )}
      </div>
    </>
  );
}
