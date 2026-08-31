import { requireAdmin } from '@/lib/auth';
import { db, getEventById } from '@/lib/db';
import { renderCertificates } from '@/lib/certificates';
import { badRequest, notFound, pdfResponse } from '@/lib/http';

export async function GET(request: Request) {
  await requireAdmin();

  const eventId = new URL(request.url).searchParams.get('eventId');
  if (!eventId) return badRequest('No event specified.');
  const event = await getEventById(eventId);
  if (!event) return notFound('Event not found.');

  const certificates = await db.certificate.findMany({
    where: { revoked: false, participant: { school: { eventId } } },
    select: { id: true },
    orderBy: [{ type: 'desc' }, { certNo: 'asc' }],
  });
  if (!certificates.length) return notFound('No certificates have been issued yet.');

  const bytes = await renderCertificates(event, certificates.map((c) => c.id));
  return pdfResponse(bytes, 'certificates-all.pdf');
}
