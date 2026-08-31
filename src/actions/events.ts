'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { logAudit, requireAdmin } from '@/lib/auth';
import { deriveEventShortCode, deriveEventSlug } from '@/lib/codes';
import { seedEventStructure } from '@/lib/event-setup';
import { ADMIN_EVENTS, adminPath, HOME } from '@/lib/paths';

export type EventState = { ok?: boolean; error?: string; message?: string } | null;

const eventSchema = z.object({
  eventName: z.string().trim().min(3, 'Event name is required.'),
  edition: z.string().trim().min(1, 'Edition (e.g. the year) is required.'),
  organiser: z.string().trim().min(2, 'Organiser is required.'),
  venue: z.string().trim().min(2, 'Venue is required.'),
  startDate: z.string().min(1, 'Pick a start date.'),
  endDate: z.string().min(1, 'Pick an end date.'),
  registrationOpensAt: z.string().min(1, 'Pick when registration opens.'),
  registrationClosesAt: z.string().min(1, 'Pick when registration closes.'),
  ageReferenceDate: z.string().min(1, 'Pick the age reference date.'),
  feePerParticipant: z.coerce.number().int().min(0),
});

/** Creates an event plus its default mat and division grid. */
export async function createEventAction(_prev: EventState, formData: FormData): Promise<EventState> {
  const session = await requireAdmin();

  const parsed = eventSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const input = parsed.data;

  const dates = {
    startDate: new Date(input.startDate),
    endDate: new Date(input.endDate),
    registrationOpensAt: new Date(input.registrationOpensAt),
    registrationClosesAt: new Date(input.registrationClosesAt),
    ageReferenceDate: new Date(input.ageReferenceDate),
  };
  for (const [key, value] of Object.entries(dates)) {
    if (Number.isNaN(value.getTime())) return { error: `${key} is not a valid date.` };
  }
  if (dates.endDate < dates.startDate) return { error: 'The event cannot end before it starts.' };
  if (dates.registrationClosesAt < dates.registrationOpensAt) {
    return { error: 'Registration cannot close before it opens.' };
  }

  const slug = await deriveEventSlug(`${input.eventName} ${input.edition}`);
  const shortCode = await deriveEventShortCode(input.eventName, input.edition);

  const event = await db.event.create({
    data: {
      slug,
      shortCode,
      eventName: input.eventName,
      edition: input.edition,
      organiser: input.organiser,
      venue: input.venue,
      feePerParticipant: input.feePerParticipant,
      signatory2Title: input.organiser,
      ...dates,
    },
  });

  // Every event starts with mats and the full WT division grid.
  await seedEventStructure(event.id, event.venue);

  await logAudit({
    userId: session.userId,
    eventId: event.id,
    action: 'EVENT_CREATED',
    entityType: 'Event',
    entityId: event.id,
    detail: `${event.eventName} ${event.edition} (${event.shortCode})`,
  });

  revalidatePath(ADMIN_EVENTS);
  revalidatePath(HOME);
  redirect(adminPath(event.id));
}

/** Show or hide an event in the public directory at "/". */
export async function toggleEventListing(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const eventId = String(formData.get('eventId') ?? '');

  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) return;

  await db.event.update({ where: { id: eventId }, data: { isPublic: !event.isPublic } });
  await logAudit({
    userId: session.userId,
    eventId,
    action: event.isPublic ? 'EVENT_UNLISTED' : 'EVENT_LISTED',
    entityType: 'Event',
    entityId: eventId,
    detail: event.eventName,
  });

  revalidatePath(ADMIN_EVENTS);
  revalidatePath(HOME);
}
