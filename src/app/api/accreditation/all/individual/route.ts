import { requireAdmin } from '@/lib/auth';
import { cardDataForAll, renderIndividualCards } from '@/lib/pdf/accreditation-service';
import { pdfResponse } from '@/lib/http';

export async function GET() {
  await requireAdmin();
  const cards = await cardDataForAll();
  return pdfResponse(await renderIndividualCards(cards), 'accreditation-cards-all-schools.pdf');
}
