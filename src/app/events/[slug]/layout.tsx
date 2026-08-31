import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getEventBySlug } from '@/lib/db';

/**
 * Applies to every route under an event — public pages and the school and mat
 * portals alike — so all of them carry the event's own title. The public
 * header, nav and footer live in `(public)/layout.tsx` instead: a signed-in
 * official already has their own header, and stacking both left a phone with
 * ~300px of chrome before any content.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) return { title: 'Event not found' };

  return {
    title: {
      default: `${event.eventName} ${event.edition}`,
      template: `%s · ${event.eventName}`,
    },
    description:
      'Registration, accreditation, live draws, scoring, medal tally and digital certificates for the championship.',
  };
}

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!(await getEventBySlug(slug))) notFound();

  return <>{children}</>;
}
