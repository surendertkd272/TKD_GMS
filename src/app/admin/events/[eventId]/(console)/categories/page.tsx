import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db, getEventById } from '@/lib/db';
import { toggleCategory } from '@/actions/admin';
import { Card, PageHeader, Stat, StatusBadge, TableWrap } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { AGE_CATEGORY_SHORT, type AgeCategory } from '@/lib/constants';
import { NewCategoryForm } from './NewCategoryForm';
import { EventIdField } from '@/components/EventIdField';

export const metadata = { title: 'Categories & divisions' };
export const dynamic = 'force-dynamic';

export default async function AdminCategoriesPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ event?: string; cat?: string }>;
}) {
  await requireAdmin();
  const [{ eventId }, params] = await Promise.all([routeParams, searchParams]);
  const event = await getEventById(eventId);
  if (!event) notFound();

  const categories = await db.category.findMany({
    where: { eventId,
      ...(params.event ? { discipline: params.event } : {}),
      ...(params.cat ? { ageCategory: params.cat } : {}),
    },
    include: { _count: { select: { entries: true, bouts: true } } },
    orderBy: [{ discipline: 'asc' }, { ageCategory: 'asc' }, { gender: 'asc' }, { weightMax: 'asc' }],
  });

  const active = categories.filter((c) => c.active).length;
  const withEntries = categories.filter((c) => c._count.entries > 0).length;

  return (
    <>
      <PageHeader
        title="Categories & divisions"
        subtitle="The master grid athletes are matched into automatically from age category, gender and weight."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Divisions" value={categories.length} />
            <Stat label="Active" value={active} />
            <Stat label="With entries" value={withEntries} />
          </div>

          <Card bodyClassName="card-pad">
            <form className="grid gap-3 sm:grid-cols-[auto_auto_auto]">
              <select name="event" defaultValue={params.event ?? ''} className="select">
                <option value="">Both disciplines</option>
                <option value="KYORUGI">Kyorugi</option>
                <option value="POOMSAE">Poomsae</option>
              </select>
              <select name="cat" defaultValue={params.cat ?? ''} className="select">
                <option value="">All age categories</option>
                <option value="YOUTH">Youth</option>
                <option value="CADET">Cadet</option>
                <option value="JUNIOR">Junior</option>
              </select>
              <button type="submit" className="btn-dark">
                Filter
              </button>
            </form>
          </Card>

          <Card bodyClassName="">
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Division</th>
                    <th>Discipline</th>
                    <th>Age</th>
                    <th>Gender</th>
                    <th>Weight band</th>
                    <th>Entries</th>
                    <th>Draw</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <tr key={category.id} className={category.active ? '' : 'opacity-50'}>
                      <td className="num text-xs text-ink-muted">{category.code}</td>
                      <td className="whitespace-nowrap font-medium text-ink">{category.name}</td>
                      <td className="text-xs uppercase tracking-wide text-ink-muted">
                        {category.discipline.toLowerCase()}
                      </td>
                      <td className="whitespace-nowrap text-xs">
                        {AGE_CATEGORY_SHORT[category.ageCategory as AgeCategory] ?? category.ageCategory}
                      </td>
                      <td className="text-xs">{category.gender[0]}</td>
                      <td className="num whitespace-nowrap text-xs">
                        {category.discipline === 'POOMSAE'
                          ? (category.poomsaeType ?? '—').toLowerCase()
                          : category.weightMin != null && category.weightMax != null
                            ? `> ${category.weightMin} to ${category.weightMax} kg`
                            : category.weightMax != null
                              ? `up to ${category.weightMax} kg`
                              : `over ${category.weightMin} kg`}
                      </td>
                      <td className="num">{category._count.entries}</td>
                      <td>
                        <StatusBadge status={category.drawStatus} />
                      </td>
                      <td className="text-right">
                        <form action={toggleCategory}>
                          <EventIdField />
                          <input type="hidden" name="categoryId" value={category.id} />
                          <SubmitButton
                            className="btn-quiet btn-sm"
                            pendingLabel="…"
                            confirm={
                              category.active && category._count.entries > 0
                                ? `${category.name} has ${category._count.entries} entries. Deactivate anyway?`
                                : undefined
                            }
                          >
                            {category.active ? 'Deactivate' : 'Activate'}
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        </div>

        <NewCategoryForm />
      </div>
    </>
  );
}
