import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db, getEventBySlug } from '@/lib/db';
import { eventPath } from '@/lib/paths';
import { Card, Empty, PageHeader, Stat } from '@/components/ui';
import { fmtDate } from '@/lib/format';

export const metadata = { title: 'Gallery' };
export const dynamic = 'force-dynamic';

/**
 * Media is not uploaded through the system yet — this page surfaces the event's
 * own record (schools, divisions, medals) and is the slot a photo/video feed
 * drops into once the organising team has media to publish.
 */
export default async function GalleryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  const [schools, medals, categories] = await Promise.all([
    db.school.count({ where: { eventId: event.id, status: 'APPROVED' } }),
    db.result.count({ where: { medal: { not: null }, category: { eventId: event.id } } }),
    db.category.count({ where: { eventId: event.id, active: true, entries: { some: {} } } }),
  ]);

  const highlights = await db.result.findMany({
    where: { medal: 'GOLD', category: { eventId: event.id } },
    include: {
      category: { select: { id: true, name: true, discipline: true } },
      entry: { include: { participant: { include: { school: { select: { name: true, code: true } } } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title="Gallery"
        subtitle={`${event.eventName} ${event.edition} · ${event.venue} · ${fmtDate(event.startDate)} – ${fmtDate(event.endDate)}`}
      />

      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Schools competing" value={schools} />
          <Stat label="Divisions in play" value={categories} />
          <Stat label="Medals decided" value={medals} />
        </div>

        <Card
          title="Photos & video"
          subtitle="Media from the event will be published here by the organising team."
        >
          <Empty
            title="No media published yet"
            hint="Photographs and video from the championship are added after each day's session. Results and brackets are already live."
            action={
              <Link href={eventPath(slug, "results")} className="btn-primary btn-sm">
                Go to live results
              </Link>
            }
          />
        </Card>

        {highlights.length > 0 && (
          <Card title="Champions" subtitle="Gold medallists as their divisions are decided." bodyClassName="card-pad">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {highlights.map((result) => (
                <Link
                  key={result.id}
                  href={eventPath(slug, `results/${result.category.id}`)}
                  className="group rounded-lg border border-surface-line p-4 transition-colors hover:border-tkd-gold/50 hover:bg-amber-50/40"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Gold</p>
                  <p className="mt-1 text-base font-semibold leading-tight text-ink group-hover:text-tkd-red">
                    {result.entry.participant.name}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">{result.entry.participant.school.name}</p>
                  <p className="mt-2 text-xs text-ink-soft">{result.category.name}</p>
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
