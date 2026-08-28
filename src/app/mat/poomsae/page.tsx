import Link from 'next/link';
import { requireReferee } from '@/lib/auth';
import { db } from '@/lib/db';
import { Card, Empty, Notice, PageHeader, StatusBadge, TableWrap } from '@/components/ui';

export const metadata = { title: 'Poomsae judging' };
export const dynamic = 'force-dynamic';

export default async function PoomsaeCategoriesPage() {
  const { session, user } = await requireReferee();

  if (!user.isJury) {
    return (
      <>
        <PageHeader title="Poomsae judging" subtitle="Reserved for the jury panel." />
        <Notice kind="warn">
          Your account is not marked as a Poomsae jury member. Ask the organising team to add you to the
          panel on the Referees &amp; jury page.
        </Notice>
      </>
    );
  }

  const categories = await db.category.findMany({
    where: { event: 'POOMSAE', active: true, entries: { some: {} } },
    include: {
      _count: { select: { entries: true } },
      entries: { select: { id: true, poomsaeScores: { where: { judgeId: session.userId }, select: { id: true } } } },
    },
    orderBy: { sortOrder: 'asc' },
  });

  return (
    <>
      <PageHeader
        title="Poomsae judging"
        subtitle="Each judge scores independently. Once five or more judges have scored an entry, the highest and lowest totals are discarded and the rest averaged."
      />

      {categories.length === 0 ? (
        <Empty
          title="No Poomsae categories with entries"
          hint="Categories appear here as soon as approved athletes are entered into a Poomsae division."
        />
      ) : (
        <Card bodyClassName="">
          <TableWrap>
            <table className="table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Entries</th>
                  <th>Scored by you</th>
                  <th>Draw</th>
                  <th>Finalised</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => {
                  const myScores = category.entries.filter((e) => e.poomsaeScores.length > 0).length;
                  const complete = myScores === category._count.entries;
                  return (
                    <tr key={category.id}>
                      <td className="font-medium text-ink">{category.name}</td>
                      <td className="num">{category._count.entries}</td>
                      <td className="num">
                        {myScores}/{category._count.entries}{' '}
                        {complete ? (
                          <span className="badge-green ml-1.5">done</span>
                        ) : (
                          <span className="badge-amber ml-1.5">pending</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={category.drawStatus} />
                      </td>
                      <td>{category.finalized ? <span className="badge-green">Yes</span> : '—'}</td>
                      <td className="text-right">
                        <Link
                          href={`/mat/poomsae/${category.id}`}
                          className={category.finalized ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'}
                        >
                          {category.finalized ? 'View' : 'Score'}
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
    </>
  );
}
