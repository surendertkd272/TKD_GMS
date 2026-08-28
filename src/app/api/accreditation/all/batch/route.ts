import { requireAdmin } from '@/lib/auth';
import { cardDataForAll, renderBatchSheet } from '@/lib/pdf/accreditation-service';
import { pdfResponse } from '@/lib/http';

export async function GET() {
  await requireAdmin();
  const cards = await cardDataForAll();
  return pdfResponse(await renderBatchSheet(cards), 'accreditation-batch-all-schools.pdf');
}
