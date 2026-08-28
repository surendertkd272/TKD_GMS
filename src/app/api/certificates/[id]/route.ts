import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { renderCertificates } from '@/lib/certificates';
import { forbidden, notFound, pdfResponse } from '@/lib/http';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await currentUser();
  if (!session) return forbidden('Sign in to download certificates.');

  const { id } = await params;

  const certificate = await db.certificate.findUnique({
    where: { id },
    select: { certNo: true, revoked: true, participant: { select: { schoolId: true } } },
  });
  if (!certificate) return notFound('Certificate not found.');
  if (certificate.revoked) return forbidden('That certificate has been revoked.');

  if (session.role === 'SCHOOL' && session.schoolId !== certificate.participant.schoolId) {
    return forbidden('That certificate belongs to another school.');
  }
  if (session.role === 'REFEREE') return forbidden('Officials do not issue certificates.');

  const bytes = await renderCertificates([id]);
  return pdfResponse(bytes, `certificate-${certificate.certNo}.pdf`);
}
