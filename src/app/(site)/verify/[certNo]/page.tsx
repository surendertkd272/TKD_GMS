import Link from 'next/link';
import { db, getSettings } from '@/lib/db';
import { Card, KeyValue, Notice, PageHeader, StatusBadge } from '@/components/ui';
import { fmtDate, fmtDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Certificate verification' };

export default async function VerifyCertificatePage({ params }: { params: Promise<{ certNo: string }> }) {
  const [settings, { certNo }] = await Promise.all([getSettings(), params]);
  const normalised = decodeURIComponent(certNo).trim().toUpperCase();

  const certificate = await db.certificate.findUnique({
    where: { certNo: normalised },
    include: {
      participant: { include: { school: { select: { name: true, code: true } } } },
      category: true,
    },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6 lg:px-8">
      <PageHeader
        title="Certificate verification"
        subtitle={<span className="num">{normalised}</span>}
        actions={
          <Link href="/verify" className="btn-quiet">
            Check another
          </Link>
        }
      />

      {!certificate ? (
        <Notice kind="error">
          <strong>No certificate found with that number.</strong> Check the number printed next to the QR
          code. If it still does not resolve, the certificate did not come from this system.
        </Notice>
      ) : certificate.revoked ? (
        <Notice kind="error">
          <strong>This certificate has been revoked</strong> and is no longer valid.
        </Notice>
      ) : (
        <div className="space-y-6">
          <Notice kind="ok">
            <strong>Valid certificate</strong>, issued by {settings.organiser} for {settings.eventName}{' '}
            {settings.edition}.
          </Notice>

          <Card title="Certificate details" bodyClassName="card-pad">
            <KeyValue
              rows={[
                ['Certificate number', <span className="num">{certificate.certNo}</span>],
                ['Type', certificate.type === 'WINNER' ? 'Certificate of merit' : 'Certificate of participation'],
                ['Awarded to', certificate.participant.name],
                ['School', `${certificate.participant.school.name} (${certificate.participant.school.code})`],
                ['Division', certificate.category?.name ?? '—'],
                [
                  'Position',
                  certificate.medal ? (
                    <span className="flex items-center gap-2">
                      <StatusBadge status={certificate.medal} />
                      <span className="text-ink-muted">position {certificate.position}</span>
                    </span>
                  ) : (
                    'Participation'
                  ),
                ],
                ['Event', `${settings.eventName} ${settings.edition}`],
                ['Held at', settings.venue],
                ['Event dates', `${fmtDate(settings.startDate)} – ${fmtDate(settings.endDate)}`],
                ['Issued', fmtDateTime(certificate.issuedAt)],
              ]}
            />
          </Card>

          <Link href={`/p/${certificate.participant.code}`} className="btn-ghost">
            View this participant's competition record
          </Link>
        </div>
      )}
    </div>
  );
}
