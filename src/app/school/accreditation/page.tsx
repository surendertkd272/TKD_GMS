import Link from 'next/link';
import { requireSchool } from '@/lib/auth';
import { db } from '@/lib/db';
import { Card, Empty, Notice, PageHeader, Stat, StatusBadge, TableWrap } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { AGE_CATEGORY_SHORT, type AgeCategory } from '@/lib/constants';

export const metadata = { title: 'Accreditation cards' };
export const dynamic = 'force-dynamic';

export default async function SchoolAccreditationPage() {
  const { school } = await requireSchool();

  const participants = await db.participant.findMany({
    where: { schoolId: school.id, status: { not: 'REJECTED' } },
    include: { entries: { include: { category: true } } },
    orderBy: [{ personRole: 'asc' }, { name: 'asc' }],
  });

  const approved = school.status === 'APPROVED';
  const withPhoto = participants.filter((p) => p.photoPath).length;
  const reissued = participants.filter((p) => p.accreditationVersion > 1).length;

  return (
    <>
      <PageHeader
        title="Accreditation cards"
        subtitle="ID-card sized PDFs with a QR code used for weigh-in, bout check-in and venue access."
        actions={
          approved && participants.length > 0 ? (
            <>
              <Link href="/api/accreditation/school/batch" className="btn-ghost" target="_blank">
                Batch sheet (A4)
              </Link>
              <Link href="/api/accreditation/school/individual" className="btn-primary" target="_blank">
                All cards (ID size)
              </Link>
            </>
          ) : null
        }
      />

      <div className="space-y-6">
        {!approved && (
          <Notice kind="warn">
            <strong>Cards unlock on approval.</strong> Your school is currently{' '}
            <StatusBadge status={school.status} />. Once the organising team approves the registration,
            every card is generated automatically and downloadable here.
          </Notice>
        )}

        {approved && withPhoto < participants.length && (
          <Notice kind="info">
            {participants.length - withPhoto} participant
            {participants.length - withPhoto === 1 ? '' : 's'} have no photo. Their cards will print with
            an empty photo box —{' '}
            <Link href="/school/participants" className="font-medium underline">
              add photos
            </Link>{' '}
            and the card regenerates automatically.
          </Notice>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Cards available" value={approved ? participants.length : 0} />
          <Stat label="With photo" value={`${withPhoto}/${participants.length}`} />
          <Stat label="Reissued after an edit" value={reissued} hint="Superseded revisions" />
        </div>

        <Card
          title="Print formats"
          subtitle="Both formats come straight from the live participant record — no manual design step."
          bodyClassName="card-pad"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-surface-line p-4">
              <p className="text-sm font-semibold text-ink">Individual card — 85.6 × 54 mm</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                Exact ISO ID-1 size, one card per page. Hand this file to a card printer or lanyard
                supplier.
              </p>
            </div>
            <div className="rounded-lg border border-surface-line p-4">
              <p className="text-sm font-semibold text-ink">Batch sheet — 10 cards per A4</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                Two columns by five rows with crop marks, for printing and cutting in-house on the day.
              </p>
            </div>
          </div>
        </Card>

        {participants.length === 0 ? (
          <Empty
            title="No participants to accredit yet"
            hint="Add participants first — every approved entry gets a card automatically."
            action={
              <Link href="/school/participants/new" className="btn-primary btn-sm">
                Add participant
              </Link>
            }
          />
        ) : (
          <Card title="Participants" bodyClassName="">
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Category</th>
                    <th>Events</th>
                    <th>Photo</th>
                    <th>Rev</th>
                    <th>Issued</th>
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
                      </td>
                      <td className="whitespace-nowrap text-xs">
                        {[...new Set(p.entries.map((e) => (e.category.event === 'KYORUGI' ? 'Kyorugi' : 'Poomsae')))].join(
                          ' + ',
                        ) || '—'}
                      </td>
                      <td>
                        {p.photoPath ? <span className="badge-green">Yes</span> : <span className="badge-amber">No</span>}
                      </td>
                      <td className="num">{p.accreditationVersion}</td>
                      <td className="whitespace-nowrap text-xs text-ink-muted">
                        {p.accreditationIssuedAt ? fmtDateTime(p.accreditationIssuedAt) : 'On approval'}
                      </td>
                      <td className="text-right">
                        {approved ? (
                          <Link
                            href={`/api/accreditation/participant/${p.id}`}
                            className="btn-ghost btn-sm"
                            target="_blank"
                          >
                            PDF
                          </Link>
                        ) : (
                          <span className="text-xs text-ink-muted">Locked</span>
                        )}
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
