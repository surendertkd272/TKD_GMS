/**
 * Seeds the platform: one Super Admin (platform-wide) plus one demo event with
 * the master data an organiser would otherwise key in by hand — mats, the full
 * WT division grid, a referee/jury panel and one demo school with athletes, so
 * every module is immediately explorable.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedEventStructure } from '../src/lib/event-setup';

const db = new PrismaClient();

const YEAR = new Date().getFullYear();
const EDITION = String(YEAR);

async function seedPlatformAdmin() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@taekwondogms.org';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';

  const existing = await db.user.findFirst({ where: { email: adminEmail, role: 'SUPER_ADMIN' } });
  if (existing) {
    await db.user.update({ where: { id: existing.id }, data: { active: true } });
  } else {
    await db.user.create({
      data: {
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        name: 'Tournament Director',
        role: 'SUPER_ADMIN',
        eventId: null,
      },
    });
  }

  console.log(`  admin      ${adminEmail}`);
  return { adminEmail, adminPassword };
}

async function seedDemoEvent() {
  const slug = `taekwondo-gms-championship-${EDITION}`;

  const existing = await db.event.findUnique({ where: { slug } });
  if (existing) {
    console.log(`  event      ${existing.eventName} already present, left untouched`);
    return { event: existing, created: false };
  }

  const event = await db.event.create({
    data: {
      slug,
      shortCode: `GMS${EDITION.slice(-2)}`,
      isPublic: true,
      eventName: 'Taekwondo GMS Championship',
      edition: EDITION,
      organiser: 'Taekwondo GMS',
      venue: 'Taekwondo GMS Sports Complex',
      startDate: new Date(YEAR, 8, 20, 9, 0),
      endDate: new Date(YEAR, 8, 21, 18, 0),
      registrationOpensAt: new Date(YEAR, 6, 1),
      registrationClosesAt: new Date(YEAR, 8, 5, 23, 59),
      ageReferenceDate: new Date(YEAR, 11, 31),
      feePerParticipant: 500,
      signatory1Name: 'Nihal Singh',
      signatory1Title: 'Tournament Director',
      signatory2Name: 'Principal',
      signatory2Title: 'Taekwondo GMS',
    },
  });

  console.log(`  event      ${event.eventName} (${event.edition}) · /${event.slug}`);
  return { event, created: true };
}

async function seedOfficials(eventId: string) {
  const mats = await db.mat.findMany({ where: { eventId }, orderBy: { sortOrder: 'asc' } });

  const officials = [
    { name: 'R. Menon', email: 'referee1@taekwondogms.org', cert: 'WT Level 1', mat: 0, jury: true },
    { name: 'S. Kaur', email: 'referee2@taekwondogms.org', cert: 'National Referee', mat: 1, jury: true },
    { name: 'A. Fernandes', email: 'referee3@taekwondogms.org', cert: 'State Referee', mat: 2, jury: true },
    { name: 'D. Bhatt', email: 'referee4@taekwondogms.org', cert: 'State Referee', mat: 3, jury: true },
    { name: 'P. Iyer', email: 'jury1@taekwondogms.org', cert: 'Poomsae Judge', mat: 0, jury: true },
  ];

  for (const official of officials) {
    await db.user.upsert({
      where: { eventId_email: { eventId, email: official.email } },
      update: { assignedMatId: mats[official.mat]?.id ?? null, active: true },
      create: {
        eventId,
        email: official.email,
        passwordHash: await bcrypt.hash('Referee@123', 10),
        name: official.name,
        role: 'REFEREE',
        certification: official.cert,
        isJury: official.jury,
        assignedMatId: mats[official.mat]?.id ?? null,
      },
    });
  }

  console.log(`  officials  ${officials.length} (password: Referee@123)`);
}

async function seedDemoSchool(eventId: string, shortCode: string) {
  const demoEmail = 'coach@demotkd.edu.in';
  const existing = await db.school.findUnique({ where: { eventId_code: { eventId, code: 'DTA' } } });
  if (existing) {
    console.log('  demo       already present, left untouched');
    return demoEmail;
  }

  const demoSchool = await db.school.create({
    data: {
      eventId,
      code: 'DTA',
      name: 'Demo Taekwondo Academy',
      boardAffiliation: 'CBSE',
      address: '12 MG Road',
      city: 'Kalyan',
      state: 'Maharashtra',
      principalName: 'Anita Deshmukh',
      coachName: 'Rajesh Pillai',
      coachPhone: '+91 98200 11223',
      contactEmail: demoEmail,
      contactPhone: '+91 22 2545 1100',
      status: 'APPROVED',
      submittedAt: new Date(),
      approvedAt: new Date(),
      paymentStatus: 'PAID',
      amountDue: 4000,
      amountPaid: 4000,
      paymentRef: 'DEMO-SEED',
    },
  });

  await db.user.create({
    data: {
      eventId,
      email: demoEmail,
      passwordHash: await bcrypt.hash('School@123', 10),
      name: 'Rajesh Pillai',
      role: 'SCHOOL',
      schoolId: demoSchool.id,
    },
  });

  const demoAthletes = [
    { name: 'Aarav Sharma', gender: 'MALE', age: 13, weight: 44, belt: 'Blue' },
    { name: 'Ishaan Verma', gender: 'MALE', age: 13, weight: 43, belt: 'Red' },
    { name: 'Kabir Nair', gender: 'MALE', age: 14, weight: 44.5, belt: 'Black 1st Dan' },
    { name: 'Vivaan Rao', gender: 'MALE', age: 12, weight: 42, belt: 'Green' },
    { name: 'Ananya Desai', gender: 'FEMALE', age: 13, weight: 40, belt: 'Blue' },
    { name: 'Diya Kulkarni', gender: 'FEMALE', age: 14, weight: 40.5, belt: 'Red Stripe' },
    { name: 'Sara Menon', gender: 'FEMALE', age: 16, weight: 48, belt: 'Black 1st Dan' },
    { name: 'Riya Joshi', gender: 'FEMALE', age: 10, weight: 29, belt: 'Yellow' },
  ];

  let n = 0;
  for (const athlete of demoAthletes) {
    n++;
    const ageCategory = athlete.age <= 11 ? 'YOUTH' : athlete.age <= 14 ? 'CADET' : 'JUNIOR';
    const dob = new Date(YEAR - athlete.age, 4, 15);

    const participant = await db.participant.create({
      data: {
        code: `${shortCode}-${String(n).padStart(4, '0')}`,
        schoolId: demoSchool.id,
        name: athlete.name,
        gender: athlete.gender,
        dob,
        ageCategory,
        ageAtRef: athlete.age,
        weightKg: athlete.weight,
        beltGrade: athlete.belt,
        personRole: 'ATHLETE',
        status: 'APPROVED',
        accreditationIssuedAt: new Date(),
        emergencyContactName: 'Guardian',
        emergencyContactPhone: '+91 98200 00000',
      },
    });

    const kyorugi = await db.category.findFirst({
      where: {
        eventId,
        discipline: 'KYORUGI',
        ageCategory,
        gender: athlete.gender,
        active: true,
        OR: [{ weightMax: { gte: athlete.weight } }, { weightMax: null }],
      },
      orderBy: { weightMax: 'asc' },
    });
    if (kyorugi) await db.entry.create({ data: { participantId: participant.id, categoryId: kyorugi.id } });

    if (n % 2 === 1) {
      const poomsae = await db.category.findFirst({
        where: { eventId, discipline: 'POOMSAE', ageCategory, gender: athlete.gender, active: true },
      });
      if (poomsae) await db.entry.create({ data: { participantId: participant.id, categoryId: poomsae.id } });
    }
  }

  // Coach accreditation
  await db.participant.create({
    data: {
      code: `${shortCode}-${String(n + 1).padStart(4, '0')}`,
      schoolId: demoSchool.id,
      name: 'Rajesh Pillai',
      gender: 'MALE',
      dob: new Date(1988, 2, 4),
      ageCategory: 'JUNIOR',
      ageAtRef: 17,
      weightKg: 78,
      beltGrade: 'Black 3rd Dan+',
      personRole: 'COACH',
      status: 'APPROVED',
      accreditationIssuedAt: new Date(),
    },
  });

  console.log(`  demo       Demo Taekwondo Academy — ${demoAthletes.length} athletes + 1 coach (${demoEmail} / School@123)`);
  return demoEmail;
}

async function main() {
  console.log('→ Seeding Taekwondo GMS\n');

  const { adminEmail, adminPassword } = await seedPlatformAdmin();

  // Production wants only the Super Admin — real events are created through
  // /admin/events/new, not seeded.
  if (process.env.SEED_ADMIN_ONLY === '1') {
    console.log('\n✓ Seed complete (admin only)\n');
    console.log('  Super Admin  ', adminEmail, '/', adminPassword, '→ /admin/login');
    console.log('');
    return;
  }

  const { event } = await seedDemoEvent();

  const structure = await seedEventStructure(event.id, event.venue);
  console.log(`  mats       ${structure.mats}`);
  console.log(`  categories ${structure.categories}`);

  await seedOfficials(event.id);
  const demoEmail = await seedDemoSchool(event.id, event.shortCode);

  console.log('\n✓ Seed complete\n');
  console.log('  Super Admin  ', adminEmail, '/', adminPassword, '→ /admin/login');
  console.log('  School       ', demoEmail, '/ School@123', `→ /events/${event.slug}/login`);
  console.log('  Referee      ', `referee1@taekwondogms.org / Referee@123 → /events/${event.slug}/login`);
  console.log('');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
