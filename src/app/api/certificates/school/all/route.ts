import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { renderCertificates } from '@/lib/certificates';
import { badRequest, forbidden, notFound, pdfResponse } from '@/lib/http';

export async function GET(request: Request) {
  const session = await currentUser();
  if (!session) return forbidden('Sign in to download certificates.');

  const requested = new URL(request.url).searchParams.get('schoolId');
  const schoolId =
    session.role === 'SUPER_ADMIN' ? requested : session.role === 'SCHOOL' ? session.schoolId : null;
  if (!schoolId) return badRequest('No school specified.');

  const school = await db.school.findUnique({ where: { id: schoolId }, select: { code: true } });
  if (!school) return notFound('School not found.');

  const certificates = await db.certificate.findMany({
    where: { revoked: false, participant: { schoolId } },
    select: { id: true },
    orderBy: [{ type: 'desc' }, { certNo: 'asc' }],
  });
  if (!certificates.length) return notFound('No certificates have been issued for this school yet.');

  const bytes = await renderCertificates(certificates.map((c) => c.id));
  return pdfResponse(bytes, `certificates-${school.code}.pdf`);
}
