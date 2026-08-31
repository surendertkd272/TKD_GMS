import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { renderSingleCard } from '@/lib/pdf/accreditation-service';
import { forbidden, notFound, pdfResponse } from '@/lib/http';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await currentUser();
  if (!session) return forbidden('Sign in to download accreditation cards.');

  const { id } = await params;

  const participant = await db.participant.findUnique({
    where: { id },
    select: { code: true, schoolId: true, status: true, school: { select: { status: true, event: true } } },
  });
  if (!participant) return notFound('Participant not found.');

  // A school may only download its own cards; the organising team may download any.
  if (session.role === 'SCHOOL' && session.schoolId !== participant.schoolId) {
    return forbidden('That participant belongs to another school.');
  }
  if (session.role === 'REFEREE') return forbidden('Officials do not issue accreditation cards.');

  if (participant.school.status !== 'APPROVED') {
    return forbidden('Accreditation cards are released once the school registration is approved.');
  }

  const bytes = await renderSingleCard(participant.school.event, id);
  if (!bytes) return notFound('Could not build that card.');

  return pdfResponse(bytes, `accreditation-${participant.code}.pdf`);
}
