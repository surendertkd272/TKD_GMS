// Deliberately NOT 'server-only': this is shared with prisma/seed.ts, which runs
// as a plain CLI script outside Next's server runtime.
import { db } from './db';

/** Upper bounds per division; the last entry becomes the "+X kg" open division. */
const WEIGHT_GRID: Record<string, Record<string, number[]>> = {
  YOUTH: {
    MALE: [21, 24, 27, 30, 33, 36, 39, 42],
    FEMALE: [21, 24, 27, 30, 33, 36, 39, 42],
  },
  CADET: {
    MALE: [33, 37, 41, 45, 49, 53, 57, 61, 65],
    FEMALE: [29, 33, 37, 41, 44, 47, 51, 55, 59],
  },
  JUNIOR: {
    MALE: [45, 48, 51, 55, 59, 63, 68, 73, 78],
    FEMALE: [42, 44, 46, 49, 52, 55, 59, 63, 68],
  },
};

const AGE_SHORT: Record<string, string> = { YOUTH: 'Youth', CADET: 'Cadet', JUNIOR: 'Junior' };
const GENDER_SHORT: Record<string, string> = { MALE: 'Male', FEMALE: 'Female' };

export const DEFAULT_MAT_NAMES = ['Mat 1', 'Mat 2', 'Mat 3', 'Mat 4'];

/**
 * The master data every new event needs: mats and the full WT division grid
 * (Kyorugi weight divisions plus one individual Poomsae division per age ×
 * gender). Idempotent — safe to re-run against an existing event.
 */
export async function seedEventStructure(
  eventId: string,
  venue: string,
): Promise<{ mats: number; categories: number }> {
  for (let i = 0; i < DEFAULT_MAT_NAMES.length; i++) {
    const name = DEFAULT_MAT_NAMES[i]!;
    await db.mat.upsert({
      where: { eventId_name: { eventId, name } },
      update: { sortOrder: i },
      create: { eventId, name, venue, sortOrder: i },
    });
  }

  let sortOrder = 0;
  let categoryCount = 0;

  for (const ageCategory of ['YOUTH', 'CADET', 'JUNIOR']) {
    for (const gender of ['MALE', 'FEMALE']) {
      const bounds = WEIGHT_GRID[ageCategory]![gender]!;

      for (let i = 0; i < bounds.length; i++) {
        const max = bounds[i]!;
        const min = i === 0 ? null : bounds[i - 1]!;
        const label = `-${max} kg`;
        const code = `KYO-${ageCategory.slice(0, 3)}-${gender[0]}-${max}`;

        await db.category.upsert({
          where: { eventId_code: { eventId, code } },
          update: { sortOrder },
          create: {
            eventId,
            code,
            name: `${AGE_SHORT[ageCategory]} ${GENDER_SHORT[gender]} ${label}`,
            discipline: 'KYORUGI',
            ageCategory,
            gender,
            weightMin: min,
            weightMax: max,
            weightLabel: label,
            sortOrder,
          },
        });
        sortOrder++;
        categoryCount++;
      }

      // Open (heaviest) division
      const open = bounds[bounds.length - 1]!;
      const openCode = `KYO-${ageCategory.slice(0, 3)}-${gender[0]}-P${open}`;
      await db.category.upsert({
        where: { eventId_code: { eventId, code: openCode } },
        update: { sortOrder },
        create: {
          eventId,
          code: openCode,
          name: `${AGE_SHORT[ageCategory]} ${GENDER_SHORT[gender]} +${open} kg`,
          discipline: 'KYORUGI',
          ageCategory,
          gender,
          weightMin: open,
          weightMax: null,
          weightLabel: `+${open} kg`,
          sortOrder,
        },
      });
      sortOrder++;
      categoryCount++;

      // Poomsae — individual recognised poomsae per age × gender
      const pooCode = `POO-${ageCategory.slice(0, 3)}-${gender[0]}-RECO`;
      await db.category.upsert({
        where: { eventId_code: { eventId, code: pooCode } },
        update: { sortOrder },
        create: {
          eventId,
          code: pooCode,
          name: `${AGE_SHORT[ageCategory]} ${GENDER_SHORT[gender]} Individual Poomsae`,
          discipline: 'POOMSAE',
          ageCategory,
          gender,
          poomsaeType: 'RECOGNISED',
          sortOrder,
        },
      });
      sortOrder++;
      categoryCount++;
    }
  }

  return { mats: DEFAULT_MAT_NAMES.length, categories: categoryCount };
}
