import { cache } from 'react';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

/**
 * Event lookups are wrapped in React's `cache()` because a layout's data is NOT
 * inherited by its child pages — without this, every page under
 * /events/[slug] would re-query the same row on the same request.
 */
export const getEventBySlug = cache(async (slug: string) => {
  return db.event.findUnique({ where: { slug } });
});

export const getEventById = cache(async (id: string) => {
  return db.event.findUnique({ where: { id } });
});

/** The event an authenticated school/referee belongs to. */
export const getEventForUser = cache(async (eventId: string) => {
  return db.event.findUnique({ where: { id: eventId } });
});
