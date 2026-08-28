import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { renderCertificates } from '@/lib/certificates';
import { notFound, pdfResponse } from '@/lib/http';

export async function GET() {
  await requireAdmin();

  const certificates = await db.certificate.findMany({
    where: { revoked: false },
    select: { id: true },
    orderBy: [{ type: 'desc' }, { certNo: 'asc' }],
  });
  if (!certificates.length) return notFound('No certificates have been issued yet.');

  const bytes = await renderCertificates(certificates.map((c) => c.id));
  return pdfResponse(bytes, 'certificates-all.pdf');
}
