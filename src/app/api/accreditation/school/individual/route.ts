import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { cardDataForSchool, renderIndividualCards } from '@/lib/pdf/accreditation-service';
import { badRequest, forbidden, notFound, pdfResponse } from '@/lib/http';

export async function GET(request: Request) {
  const session = await currentUser();
  if (!session) return forbidden('Sign in to download accreditation cards.');

  const requested = new URL(request.url).searchParams.get('schoolId');
  const schoolId =
    session.role === 'SUPER_ADMIN' ? requested : session.role === 'SCHOOL' ? session.schoolId : null;
  if (!schoolId) return badRequest('No school specified.');
  if (session.role === 'SCHOOL' && requested && requested !== session.schoolId) {
    return forbidden('That school is not yours.');
  }

  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { code: true, status: true, event: true },
  });
  if (!school) return notFound('School not found.');
  if (school.status !== 'APPROVED') return forbidden('Cards are released once the registration is approved.');

  const cards = await cardDataForSchool(schoolId);
  return pdfResponse(await renderIndividualCards(school.event, cards), `accreditation-cards-${school.code}.pdf`);
}
