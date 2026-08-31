import { requireAdmin } from '@/lib/auth';
import { getEventById } from '@/lib/db';
import { cardDataForAll, renderBatchSheet } from '@/lib/pdf/accreditation-service';
import { badRequest, notFound, pdfResponse } from '@/lib/http';

export async function GET(request: Request) {
  await requireAdmin();

  const eventId = new URL(request.url).searchParams.get('eventId');
  if (!eventId) return badRequest('No event specified.');
  const event = await getEventById(eventId);
  if (!event) return notFound('Event not found.');

  const cards = await cardDataForAll(eventId);
  return pdfResponse(await renderBatchSheet(event, cards), 'accreditation-batch-all-schools.pdf');
}
