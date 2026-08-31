'use client';

import { useParams } from 'next/navigation';

/**
 * Every admin server action resolves its event from `formData.get('eventId')`
 * (see `requireEvent` in src/actions/admin.ts). Dropping this into a form reads
 * the id straight off the `/admin/events/[eventId]/…` route, so no page has to
 * thread the id down as a prop — and a form that forgets it fails loudly with
 * "Missing event context" rather than touching another event's data.
 */
export function EventIdField() {
  const params = useParams<{ eventId?: string }>();
  return <input type="hidden" name="eventId" value={params?.eventId ?? ''} />;
}
