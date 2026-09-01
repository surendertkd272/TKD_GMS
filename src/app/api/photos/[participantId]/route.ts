import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { readPhoto } from '@/lib/photo-storage';

/**
 * Serves a participant photo to people entitled to see it: the school that
 * entered them, and the organiser. The storage bucket is private, so this route
 * is the only way a photo reaches a browser — no signed URLs leak out, and
 * access control stays next to the rest of the app's rules.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ participantId: string }> },
) {
  const session = await currentUser();
  if (!session) return new NextResponse('Not authorised', { status: 401 });

  const { participantId } = await params;
  const participant = await db.participant.findUnique({
    where: { id: participantId },
    select: { photoPath: true, schoolId: true, school: { select: { eventId: true } } },
  });
  if (!participant?.photoPath) return new NextResponse('Not found', { status: 404 });

  const isOwnSchool = session.role === 'SCHOOL' && session.schoolId === participant.schoolId;
  const isOrganiser = session.role === 'SUPER_ADMIN';
  const isEventOfficial = session.role === 'REFEREE' && session.eventId === participant.school.eventId;
  if (!isOwnSchool && !isOrganiser && !isEventOfficial) {
    return new NextResponse('Not authorised', { status: 403 });
  }

  const photo = await readPhoto(participant.photoPath);
  if (!photo) return new NextResponse('Not found', { status: 404 });

  return new NextResponse(new Uint8Array(photo.bytes), {
    headers: {
      'Content-Type': photo.contentType,
      // Private: a photo of a minor must not sit in a shared cache.
      'Cache-Control': 'private, max-age=300',
    },
  });
}
