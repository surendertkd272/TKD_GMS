import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

/** EventSettings is a singleton row (id = 1). Created by the seed. */
export async function getSettings() {
  const existing = await db.eventSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;

  const year = new Date().getFullYear();
  return db.eventSettings.create({
    data: {
      id: 1,
      startDate: new Date(year, 8, 20),
      endDate: new Date(year, 8, 21),
      registrationOpensAt: new Date(year, 6, 1),
      registrationClosesAt: new Date(year, 8, 5),
      ageReferenceDate: new Date(year, 11, 31),
    },
  });
}
