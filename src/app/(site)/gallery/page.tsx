import Link from 'next/link';
import { db, getSettings } from '@/lib/db';
import { Card, Empty, PageHeader, Stat } from '@/components/ui';
import { fmtDate } from '@/lib/format';

export const metadata = { title: 'Gallery' };
export const dynamic = 'force-dynamic';

/**
 * Media is not uploaded through the system yet — this page surfaces the event's
 * own record (schools, divisions, medals) and is the slot a photo/video feed
 * drops into once the organising team has media to publish.
 */
export default async function GalleryPage() {
  const [settings, schools, medals, categories] = await Promise.all([
    getSettings(),
    db.school.count({ where: { status: 'APPROVED' } }),
    db.result.count({ where: { medal: { not: null } } }),
    db.category.count({ where: { active: true, entries: { some: {} } } }),
  ]);

  const highlights = await db.result.findMany({
    where: { medal: 'GOLD' },
    include: {
      category: { select: { id: true, name: true, event: true } },
      entry: { include: { participant: { include: { school: { select: { name: true, code: true } } } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        title="Gallery"
        subtitle={`${settings.eventName} ${settings.edition} · ${settings.venue} · ${fmtDate(settings.startDate)} – ${fmtDate(settings.endDate)}`}
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
              <Link href="/results" className="btn-primary btn-sm">
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
                  href={`/results/${result.category.id}`}
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
