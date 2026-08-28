import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

let counter = 0;
/** Cheap unique suffix so parallel factory calls in one test never collide on a unique field. */
function seq(): number {
  counter += 1;
  return counter;
}

/** Deletes every row from every table, children first, so each test starts from empty. */
export async function resetDb() {
  await db.bout.deleteMany();
  await db.boutRound.deleteMany();
  await db.result.deleteMany();
  await db.certificate.deleteMany();
  await db.poomsaeScore.deleteMany();
  await db.entry.deleteMany();
  await db.category.deleteMany();
  await db.poomsaeSession.deleteMany();
  await db.payment.deleteMany();
  await db.participant.deleteMany();
  await db.user.deleteMany();
  await db.school.deleteMany();
  await db.mat.deleteMany();
  await db.auditLog.deleteMany();
  await db.eventSettings.deleteMany();
}

export async function createSchool(overrides: Partial<Prisma.SchoolUncheckedCreateInput> = {}) {
  const n = seq();
  return db.school.create({
    data: {
      code: `SCH${n}`,
      name: `Test School ${n}`,
      contactEmail: `school${n}@example.com`,
      status: 'APPROVED',
      ...overrides,
    },
  });
}

export async function createParticipant(
  schoolId: string,
  overrides: Partial<Prisma.ParticipantUncheckedCreateInput> = {},
) {
  const n = seq();
  return db.participant.create({
    data: {
      code: `TKD-${n}`,
      schoolId,
      name: `Athlete ${n}`,
      gender: 'MALE',
      dob: new Date(2012, 0, 1),
      ageCategory: 'CADET',
      ageAtRef: 13,
      weightKg: 45,
      beltGrade: 'Blue',
      status: 'APPROVED',
      ...overrides,
    },
  });
}

export async function createCategory(overrides: Partial<Prisma.CategoryUncheckedCreateInput> = {}) {
  const n = seq();
  return db.category.create({
    data: {
      code: `CAT${n}`,
      name: `Category ${n}`,
      event: 'KYORUGI',
      ageCategory: 'CADET',
      gender: 'MALE',
      sortOrder: n,
      ...overrides,
    },
  });
}

export async function createEntry(participantId: string, categoryId: string) {
  return db.entry.create({ data: { participantId, categoryId } });
}

export async function createMat(overrides: Partial<Prisma.MatUncheckedCreateInput> = {}) {
  const n = seq();
  return db.mat.create({ data: { name: `Mat ${n}`, sortOrder: n, ...overrides } });
}

export async function createReferee(overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  const n = seq();
  return db.user.create({
    data: {
      email: `ref${n}@example.com`,
      passwordHash: 'x',
      name: `Referee ${n}`,
      role: 'REFEREE',
      ...overrides,
    },
  });
}

export async function createBout(overrides: Partial<Prisma.BoutUncheckedCreateInput> & { categoryId: string }) {
  const n = seq();
  return db.bout.create({
    data: {
      round: 1,
      roundLabel: 'Round of 16',
      position: 0,
      boutNumber: n,
      ...overrides,
    },
  });
}
