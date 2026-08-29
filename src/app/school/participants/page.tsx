import Link from 'next/link';
import { requireSchool } from '@/lib/auth';
import { db, getSettings } from '@/lib/db';
import { Card, Empty, Notice, PageHeader, StatusBadge, TableWrap } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { AGE_CATEGORY_SHORT, type AgeCategory } from '@/lib/constants';

export const metadata = { title: 'Participants' };
export const dynamic = 'force-dynamic';

export default async function ParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; warn?: string; q?: string; cat?: string; role?: string }>;
}) {
  const [{ school }, settings, params] = await Promise.all([requireSchool(), getSettings(), searchParams]);

  const participants = await db.participant.findMany({
    where: {
      schoolId: school.id,
      ...(params.q ? { name: { contains: params.q } } : {}),
      ...(params.cat ? { ageCategory: params.cat } : {}),
      ...(params.role ? { personRole: params.role } : {}),
    },
    include: { entries: { include: { category: true } } },
    orderBy: [{ personRole: 'asc' }, { ageCategory: 'asc' }, { name: 'asc' }],
  });

  const total = await db.participant.count({ where: { schoolId: school.id } });
  const missingPhotoCount = await db.participant.count({ where: { schoolId: school.id, photoPath: null } });

  return (
    <>
      <PageHeader
        title="Participants"
        subtitle={`${total} entered for ${school.name}. Edit freely until registration closes on ${fmtDate(settings.registrationClosesAt)}.`}
        actions={
          <>
            <Link href="/school/bulk-upload" className="btn-ghost">
              Bulk CSV upload
            </Link>
            <Link href="/school/participants/new" className="btn-primary">
              Add participant
            </Link>
          </>
        }
      />

      <div className="space-y-5">
        {params.created && (
          <Notice kind="ok">
            Added <span className="num font-semibold">{params.created}</span>. The accreditation card is
            ready as soon as the school is approved.
          </Notice>
        )}
        {params.warn && (
          <Notice kind="warn">
            {params.warn.split(' | ').map((w) => (
              <span key={w} className="block">
                {w}
              </span>
            ))}
          </Notice>
        )}

        {missingPhotoCount > 0 && (
          <Notice kind="warn">
            {missingPhotoCount} participant{missingPhotoCount === 1 ? '' : 's'} missing a photo — the
            accreditation card prints an empty photo box without one. Photos can&apos;t come through the
            CSV upload; open each participant&apos;s <span className="font-medium">Edit</span> page below to
            add one.
          </Notice>
        )}

        <Card bodyClassName="card-pad">
          <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
            <input
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="Search by name…"
              className="input"
              aria-label="Search participants"
            />
            <select name="cat" defaultValue={params.cat ?? ''} className="select" aria-label="Age category">
              <option value="">All age categories</option>
              <option value="YOUTH">Youth (11 &amp; under)</option>
              <option value="CADET">Cadet (12–14)</option>
              <option value="JUNIOR">Junior (15–17)</option>
            </select>
            <select name="role" defaultValue={params.role ?? ''} className="select" aria-label="Role">
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
          <Empty
            title={total === 0 ? 'No participants entered yet' : 'No participants match that filter'}
            hint={
              total === 0
                ? 'Add athletes one at a time, or upload your whole squad from a CSV in one go.'
                : 'Clear the filters to see the full squad.'
            }
            action={
              total === 0 ? (
                <div className="flex gap-2">
                  <Link href="/school/participants/new" className="btn-primary btn-sm">
                    Add participant
                  </Link>
                  <Link href="/school/bulk-upload" className="btn-ghost btn-sm">
                    Bulk upload
                  </Link>
                </div>
              ) : (
                <Link href="/school/participants" className="btn-ghost btn-sm">
                  Clear filters
                </Link>
              )
            }
          />
        ) : (
          <Card bodyClassName="">
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Category</th>
                    <th>Weight</th>
                    <th>Belt</th>
                    <th>Divisions entered</th>
                    <th>Photo</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {participants.map((p) => (
                    <tr key={p.id}>
                      <td className="num whitespace-nowrap text-ink-muted">{p.code}</td>
                      <td className="whitespace-nowrap font-medium text-ink">{p.name}</td>
                      <td className="text-xs uppercase tracking-wide text-ink-muted">
                        {p.personRole.toLowerCase()}
                      </td>
                      <td className="whitespace-nowrap">
                        {AGE_CATEGORY_SHORT[p.ageCategory as AgeCategory] ?? p.ageCategory} ·{' '}
                        {p.gender === 'MALE' ? 'M' : 'F'}
                        <span className="ml-1.5 text-xs text-ink-muted">({p.ageAtRef}y)</span>
                      </td>
                      <td className="num">{p.weightKg} kg</td>
                      <td className="whitespace-nowrap">{p.beltGrade}</td>
                      <td>
                        {p.entries.length === 0 ? (
                          p.personRole === 'ATHLETE' ? (
                            <span className="badge-amber">No division matched</span>
                          ) : (
                            <span className="text-ink-muted">—</span>
                          )
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {p.entries.map((e) => (
                              <span key={e.id} className="badge-neutral">
                                {e.category.name}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td>{p.photoPath ? <span className="badge-green">Yes</span> : <span className="badge-amber">Missing</span>}</td>
                      <td>
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="text-right">
                        <Link href={`/school/participants/${p.id}`} className="btn-ghost btn-sm">
                          Edit
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
    </>
  );
}
