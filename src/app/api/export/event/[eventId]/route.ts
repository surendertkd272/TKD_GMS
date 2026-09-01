import { NextResponse } from 'next/server';
import { db, getEventById } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { medalTally } from '@/lib/medals';

export const dynamic = 'force-dynamic';

/**
 * The whole championship as one JSON file: squads, divisions, every bout, final
 * standings and the audit trail. Federations ask for this after an event, and
 * it doubles as a backup the organiser holds themselves rather than one that
 * exists only in the hosted database.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  await requireAdmin();
  const { eventId } = await params;

  const event = await getEventById(eventId);
  if (!event) return new NextResponse('Event not found', { status: 404 });

  const [schools, categories, bouts, results, certificates, audit] = await Promise.all([
    db.school.findMany({
      where: { eventId },
      orderBy: { code: 'asc' },
      include: {
        participants: {
          orderBy: { code: 'asc' },
          include: { entries: { select: { categoryId: true, seed: true, status: true } } },
        },
        payments: { orderBy: { paidAt: 'asc' } },
      },
    }),
    db.category.findMany({ where: { eventId }, orderBy: [{ discipline: 'asc' }, { sortOrder: 'asc' }] }),
    db.bout.findMany({
      where: { category: { eventId } },
      orderBy: [{ boutNumber: 'asc' }],
      include: {
        rounds: { orderBy: { roundNo: 'asc' } },
        mat: { select: { name: true } },
        redEntry: { select: { participant: { select: { code: true, name: true } } } },
        blueEntry: { select: { participant: { select: { code: true, name: true } } } },
      },
    }),
    db.result.findMany({
      where: { category: { eventId } },
      orderBy: [{ categoryId: 'asc' }, { position: 'asc' }],
      include: { entry: { select: { participant: { select: { code: true, name: true } } } } },
    }),
    db.certificate.findMany({
      where: { participant: { school: { eventId } } },
      orderBy: { certNo: 'asc' },
      select: { certNo: true, type: true, medal: true, issuedAt: true, revoked: true, participantId: true },
    }),
    db.auditLog.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { name: true, email: true, role: true } } },
    }),
  ]);

  const tally = await medalTally(eventId, event);

  const payload = {
    exportedAt: new Date().toISOString(),
    format: 'taekwondo-gms/event-export@1',
    event,
    schools,
    categories,
    bouts,
    results,
    medalTally: tally,
    certificates,
    audit,
  };

  const filename = `${event.shortCode}-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
