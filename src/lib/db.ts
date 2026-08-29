import { PrismaClient } from '@prisma/client';
import { createClient } from '@libsql/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const log = process.env.NODE_ENV === 'development' ? (['warn', 'error'] as const) : (['error'] as const);

/**
 * Local/venue deployment keeps the zero-config file:./dev.db connection. A hosted
 * (Turso) database is used only when its env vars are present — e.g. on Vercel,
 * whose serverless functions can't persist a local SQLite file.
 */
function createDb(): PrismaClient {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) return new PrismaClient({ log: [...log] });

  const adapter = new PrismaLibSQL(createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN }));
  return new PrismaClient({ adapter, log: [...log] });
}

export const db = globalForPrisma.prisma ?? createDb();

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
