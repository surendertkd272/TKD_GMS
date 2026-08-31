import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { db, getEventById } from '@/lib/db';
import { Card, Empty, Notice, PageHeader, Stat, StatusBadge, TableWrap } from '@/components/ui';
import { AGE_CATEGORY_SHORT, type AgeCategory } from '@/lib/constants';
import { adminPath } from '@/lib/paths';

export const metadata = { title: 'Participants' };
export const dynamic = 'force-dynamic';

export default async function AdminParticipantsPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ q?: string; cat?: string; gender?: string; school?: string; unmatched?: string; role?: string }>;
}) {
  await requireAdmin();
  const [{ eventId }, params] = await Promise.all([routeParams, searchParams]);
  const event = await getEventById(eventId);
  if (!event) notFound();

  const [participants, schools, stats] = await Promise.all([
    db.participant.findMany({
      where: { school: { eventId },
        ...(params.q
          ? {
              OR: [
                { name: { contains: params.q, mode: 'insensitive' } },
                { code: { contains: params.q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(params.cat ? { ageCategory: params.cat } : {}),
        ...(params.gender ? { gender: params.gender } : {}),
        ...(params.school ? { schoolId: params.school } : {}),
        ...(params.role ? { personRole: params.role } : {}),
        ...(params.unmatched === '1' ? { personRole: 'ATHLETE', entries: { none: {} } } : {}),
      },
      include: {
        school: { select: { code: true, name: true, status: true } },
        entries: { include: { category: { select: { name: true, discipline: true } } } },
      },
      orderBy: [{ school: { name: 'asc' } }, { name: 'asc' }],
      take: 400,
    }),
    db.school.findMany({ where: { eventId }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }),
    db.participant.groupBy({ by: ['ageCategory'], where: { school: { eventId } }, _count: true }),
  ]);

  const byCategory = Object.fromEntries(stats.map((s) => [s.ageCategory, s._count]));
  const unmatchedCount = await db.participant.count({ where: { school: { eventId }, personRole: 'ATHLETE', entries: { none: {} } } });

  return (
    <>
      <PageHeader
        title="Participants"
        subtitle="Every entry across every school. Age categories are computed from date of birth, never typed in."
        actions={
          <a href="/api/export/participants" className="btn-ghost" download>
            Export CSV
          </a>
        }
      />

      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Youth (11 &amp; under)" value={byCategory.YOUTH ?? 0} />
          <Stat label="Cadet (12–14)" value={byCategory.CADET ?? 0} />
          <Stat label="Junior (15–17)" value={byCategory.JUNIOR ?? 0} />
          <Stat label="No division matched" value={unmatchedCount} hint="Needs attention" />
        </div>

        {unmatchedCount > 0 && params.unmatched !== '1' && (
          <Notice kind="warn">
            {unmatchedCount} athlete{unmatchedCount === 1 ? '' : 's'} did not match any weight division —
            usually a weight above or below the configured grid.{' '}
            <Link href="/admin/participants?unmatched=1" className="font-medium underline">
              Show them
            </Link>{' '}
            or{' '}
            <Link href={adminPath(eventId, 'categories')} className="font-medium underline">
              add a division
            </Link>
            .
          </Notice>
        )}

        <Card bodyClassName="card-pad">
          <form className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto_auto_auto]">
            <input name="q" defaultValue={params.q ?? ''} placeholder="Name or participant ID…" className="input" />
            <select name="school" defaultValue={params.school ?? ''} className="select">
              <option value="">All schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.code} — {school.name}
                </option>
              ))}
            </select>
            <select name="cat" defaultValue={params.cat ?? ''} className="select">
              <option value="">All ages</option>
              <option value="YOUTH">Youth</option>
              <option value="CADET">Cadet</option>
              <option value="JUNIOR">Junior</option>
            </select>
            <select name="gender" defaultValue={params.gender ?? ''} className="select">
              <option value="">All genders</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </select>
            <select name="role" defaultValue={params.role ?? ''} className="select">
              <option value="">All roles</option>
              <option value="ATHLETE">Athlete</option>
              <option value="COACH">Coach</option>
              <option value="OFFICIAL">Official</option>
              <option value="VOLUNTEER">Volunteer</option>
            </select>
            <button type="submit" className="btn-dark">
              Filter
            </button>
          </form>
        </Card>

        {participants.length === 0 ? (
          <Empty title="No participants match" hint="Clear the filters to see the full field." />
        ) : (
          <Card
            title={`${participants.length} participant${participants.length === 1 ? '' : 's'}`}
            subtitle={participants.length === 400 ? 'Showing the first 400 — narrow the filters to see more.' : undefined}
            bodyClassName=""
          >
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>School</th>
                    <th>Role</th>
                    <th>Category</th>
                    <th>Weight</th>
                    <th>Belt</th>
                    <th>Divisions</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((p) => (
                    <tr key={p.id}>
                      <td className="num text-ink-muted">{p.code}</td>
                      <td className="whitespace-nowrap font-medium text-ink">{p.name}</td>
                      <td className="whitespace-nowrap text-xs">
                        <Link href={adminPath(eventId, `schools/${p.schoolId}`)} className="hover:text-tkd-red">
                          {p.school.code}
                        </Link>
                      </td>
                      <td className="text-xs uppercase tracking-wide text-ink-muted">{p.personRole.toLowerCase()}</td>
                      <td className="whitespace-nowrap">
                        {AGE_CATEGORY_SHORT[p.ageCategory as AgeCategory] ?? p.ageCategory} ·{' '}
                        {p.gender === 'MALE' ? 'M' : 'F'}
                      </td>
                      <td className="num">{p.weightKg}</td>
                      <td className="whitespace-nowrap text-xs">{p.beltGrade}</td>
                      <td className="text-xs">
                        {p.entries.length === 0 ? (
                          p.personRole === 'ATHLETE' ? (
                            <span className="badge-amber">Unmatched</span>
                          ) : (
                            '—'
                          )
                        ) : (
                          p.entries.map((e) => e.category.name).join(', ')
                        )}
                      </td>
                      <td>
                        <StatusBadge status={p.status} />
                      </td>
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
