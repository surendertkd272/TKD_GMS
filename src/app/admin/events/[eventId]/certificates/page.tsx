import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { db, getEventById } from '@/lib/db';
import { mailModeLabel } from '@/lib/mail';
import { smsModeLabel } from '@/lib/sms';
import { Card, Empty, Notice, PageHeader, Stat, StatusBadge, TableWrap } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { CertificateControls } from './CertificateControls';

export const metadata = { title: 'Certificates' };
export const dynamic = 'force-dynamic';

export default async function AdminCertificatesPage({ params }: { params: Promise<{ eventId: string }> }) {
  await requireAdmin();
  const { eventId } = await params;
  const event = await getEventById(eventId);
  if (!event) notFound();

  const [certificates, finalizedCategories, schools, stats] = await Promise.all([
    db.certificate.findMany({
      where: { participant: { school: { eventId } }, revoked: false },
      include: {
        participant: { include: { school: { select: { code: true, name: true } } } },
        category: { select: { name: true } },
      },
      orderBy: [{ issuedAt: 'desc' }],
      take: 200,
    }),
    db.category.findMany({
      where: { eventId, finalized: true },
      include: { _count: { select: { results: true, certificates: true } } },
      orderBy: { sortOrder: 'asc' },
    }),
    db.school.findMany({
      where: { eventId, participants: { some: { certificates: { some: { revoked: false } } } } },
      select: { id: true, name: true, code: true, contactEmail: true },
      orderBy: { name: 'asc' },
    }),
    db.certificate.groupBy({ by: ['type'], where: { revoked: false, participant: { school: { eventId } } }, _count: true }),
  ]);

  const [totalCerts, unsent] = await Promise.all([
    db.certificate.count({ where: { revoked: false, participant: { school: { eventId } } } }),
    db.certificate.count({ where: { revoked: false, emailedAt: null, participant: { school: { eventId } } } }),
  ]);

  const byType = Object.fromEntries(stats.map((s) => [s.type, s._count]));
  const pendingIssue = finalizedCategories.filter((c) => c._count.certificates === 0);

  return (
    <>
      <PageHeader
        title="Certificates"
        subtitle="Participation certificates for every entrant and merit certificates for medallists — generated from finalised results and emailed to each school in one batch."
        actions={
          totalCerts > 0 ? (
            <Link href="/api/certificates/all" className="btn-ghost" target="_blank">
              Download all as one PDF
            </Link>
          ) : null
        }
      />

      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Issued" value={totalCerts} />
          <Stat label="Participation" value={byType.PARTICIPATION ?? 0} />
          <Stat label="Merit (medal)" value={byType.WINNER ?? 0} />
          <Stat label="Awaiting email" value={unsent} />
        </div>

        <Notice kind="info">
          <strong>Mail transport:</strong> {mailModeLabel()}. <strong>SMS/WhatsApp transport:</strong>{' '}
          {smsModeLabel()}. Without live credentials every dispatch is written to{' '}
          <span className="num">./storage/outbox</span> so the flow is fully testable before go-live. A
          text notification goes to the school's coach/contact phone alongside each certificate email.
        </Notice>

        {pendingIssue.length > 0 && (
          <Notice kind="warn">
            {pendingIssue.length} finalised categor{pendingIssue.length === 1 ? 'y has' : 'ies have'} no
            certificates issued yet. Use “Issue for every finalised category” below.
          </Notice>
        )}

        <CertificateControls
          categories={finalizedCategories.map((c) => ({
            id: c.id,
            name: c.name,
            results: c._count.results,
            certificates: c._count.certificates,
          }))}
          schools={schools}
        />

        {certificates.length === 0 ? (
          <Empty
            title="No certificates issued yet"
            hint="Finalise a category — a completed Kyorugi bracket finalises itself; Poomsae is finalised from its draw page — then issue certificates here."
          />
        ) : (
          <Card
            title="Issued certificates"
            subtitle={certificates.length === 200 ? 'Showing the 200 most recent.' : undefined}
            bodyClassName=""
          >
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Certificate no.</th>
                    <th>Participant</th>
                    <th>School</th>
                    <th>Type</th>
                    <th>Division</th>
                    <th>Medal</th>
                    <th>Issued</th>
                    <th>Emailed</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {certificates.map((cert) => (
                    <tr key={cert.id}>
                      <td className="num text-xs text-ink-muted">{cert.certNo}</td>
                      <td className="whitespace-nowrap font-medium text-ink">{cert.participant.name}</td>
                      <td className="text-xs">{cert.participant.school.code}</td>
                      <td>
                        {cert.type === 'WINNER' ? (
                          <span className="badge-blue">Merit</span>
                        ) : (
                          <span className="badge-neutral">Participation</span>
                        )}
                      </td>
                      <td className="text-xs">{cert.category?.name ?? '—'}</td>
                      <td>{cert.medal ? <StatusBadge status={cert.medal} /> : '—'}</td>
                      <td className="whitespace-nowrap text-xs text-ink-muted">{fmtDateTime(cert.issuedAt)}</td>
                      <td className="whitespace-nowrap text-xs">
                        {cert.emailedAt ? (
                          <span className="text-emerald-700">{fmtDateTime(cert.emailedAt)}</span>
                        ) : (
                          <span className="text-ink-muted">Not sent</span>
                        )}
                      </td>
                      <td className="text-right">
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
        )}
      </div>
    </>
  );
}
