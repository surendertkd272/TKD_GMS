import Link from 'next/link';
import { requireSchool } from '@/lib/auth';
import { db } from '@/lib/db';
import { Card, Empty, Notice, PageHeader, Stat, StatusBadge, TableWrap } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';

export const metadata = { title: 'Certificates' };
export const dynamic = 'force-dynamic';

export default async function SchoolCertificatesPage() {
  const { school, event } = await requireSchool();

  const certificates = await db.certificate.findMany({
    where: { participant: { schoolId: school.id }, revoked: false },
    include: { participant: true, category: true },
    orderBy: [{ type: 'desc' }, { certNo: 'asc' }],
  });

  const winners = certificates.filter((c) => c.type === 'WINNER');
  const emailed = certificates.filter((c) => c.emailedAt);

  return (
    <>
      <PageHeader
        title="Certificates"
        subtitle="Generated automatically when a category is finalised, and emailed to your school's registered address."
        actions={
          certificates.length > 0 ? (
            <Link href="/api/certificates/school/all" className="btn-primary" target="_blank">
              Download all ({certificates.length})
            </Link>
          ) : null
        }
      />

      <div className="space-y-6">
        {certificates.length === 0 ? (
          <Empty
            title="No certificates issued yet"
            hint="Participation certificates go to every athlete and merit certificates to medallists, the moment their category is finalised. They are emailed to your registered address and stay downloadable here."
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Certificates" value={certificates.length} />
              <Stat label="Merit (medal)" value={winners.length} />
              <Stat label="Emailed" value={`${emailed.length}/${certificates.length}`} />
            </div>

            {emailed.length > 0 && (
              <Notice kind="ok">
                {emailed.length} certificate{emailed.length === 1 ? '' : 's'} already sent to{' '}
                <strong>{school.contactEmail}</strong>. You can re-download any of them here at any time.
              </Notice>
            )}

            <Card title="Issued certificates" bodyClassName="">
              <TableWrap>
                <table className="table table-cards">
                  <thead>
                    <tr>
                      <th>Certificate no.</th>
                      <th>Participant</th>
                      <th>Type</th>
                      <th>Division</th>
                      <th>Medal</th>
                      <th>Emailed</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {certificates.map((cert) => (
                      <tr key={cert.id}>
                        <td className="num whitespace-nowrap text-ink-muted" data-label="Certificate no.">{cert.certNo}</td>
                        <td className="whitespace-nowrap font-medium text-ink" data-label="Participant">{cert.participant.name}</td>
                        <td data-label="Type">
                          {cert.type === 'WINNER' ? (
                            <span className="badge-blue">Merit</span>
                          ) : (
                            <span className="badge-neutral">Participation</span>
                          )}
                        </td>
                        <td data-label="Division">{cert.category?.name ?? '—'}</td>
                        <td data-label="Medal">{cert.medal ? <StatusBadge status={cert.medal} /> : '—'}</td>
                        <td className="whitespace-nowrap text-xs text-ink-muted" data-label="Emailed">
                          {cert.emailedAt ? fmtDateTime(cert.emailedAt) : 'Not sent'}
                        </td>
                        <td className="text-right" data-label="">
                          <Link href={`/api/certificates/${cert.id}`} className="btn-ghost btn-sm" target="_blank">
                            PDF
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
