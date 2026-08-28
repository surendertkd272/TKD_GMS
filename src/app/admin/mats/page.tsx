import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { toggleMat } from '@/actions/admin';
import { Card, PageHeader, StatusBadge, TableWrap } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { NewMatForm } from './NewMatForm';

export const metadata = { title: 'Mats' };
export const dynamic = 'force-dynamic';

export default async function AdminMatsPage() {
  await requireAdmin();

  const mats = await db.mat.findMany({
    include: {
      _count: { select: { bouts: true } },
      officials: { where: { active: true }, select: { id: true, name: true, isJury: true } },
    },
    orderBy: { sortOrder: 'asc' },
  });

  return (
    <>
      <PageHeader
        title="Mats"
        subtitle="Rings in play. Auto-assignment spreads bouts across the active mats, and each official's scoring panel is scoped to the mat they are assigned to."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card bodyClassName="">
          <TableWrap>
            <table className="table">
              <thead>
                <tr>
                  <th>Mat</th>
                  <th>Venue</th>
                  <th>Bouts assigned</th>
                  <th>Officials on this mat</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {mats.map((mat) => (
                  <tr key={mat.id} className={mat.active ? '' : 'opacity-50'}>
                    <td className="font-medium text-ink">{mat.name}</td>
                    <td className="text-xs">{mat.venue ?? '—'}</td>
                    <td className="num">{mat._count.bouts}</td>
                    <td className="text-xs">
                      {mat.officials.length === 0
                        ? '—'
                        : mat.officials.map((o) => `${o.name}${o.isJury ? ' (jury)' : ''}`).join(', ')}
                    </td>
                    <td>
                      <StatusBadge status={mat.active ? 'ACTIVE' : 'WITHDRAWN'} label={mat.active ? 'Active' : 'Inactive'} />
                    </td>
                    <td className="text-right">
                      <form action={toggleMat}>
                        <input type="hidden" name="matId" value={mat.id} />
                        <SubmitButton className="btn-quiet btn-sm" pendingLabel="…">
                          {mat.active ? 'Deactivate' : 'Activate'}
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>

        <NewMatForm />
      </div>
    </>
  );
}
