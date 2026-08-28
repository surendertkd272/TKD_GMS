/**
 * Seeds the championship with the master data an organiser would otherwise key
 * in by hand: event settings, mats, the full WT weight-division grid, the
 * Super Admin login, a referee/jury panel, and one demo school with athletes so
 * every module is immediately explorable.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

const YEAR = new Date().getFullYear();
const EDITION = String(YEAR);

// Upper bounds per division; the last entry becomes the "+X kg" open division.
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

async function main() {
  console.log('→ Seeding Taekwondo Game Management System\n');

  // ---------------------------------------------------------------- settings
  const settings = await db.eventSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      eventName: 'P.R.S Nair Open School Taekwondo Championship',
      edition: EDITION,
      organiser: 'Sacred Heart School',
      venue: 'Sacred Heart School, Sports Complex',
      startDate: new Date(YEAR, 8, 20, 9, 0),
      endDate: new Date(YEAR, 8, 21, 18, 0),
      registrationOpensAt: new Date(YEAR, 6, 1),
      registrationClosesAt: new Date(YEAR, 8, 5, 23, 59),
      ageReferenceDate: new Date(YEAR, 11, 31),
      feePerParticipant: 500,
      signatory1Name: 'Nihal Singh',
      signatory1Title: 'Tournament Director',
      signatory2Name: 'Principal',
      signatory2Title: 'Sacred Heart School',
    },
  });
  console.log(`  settings   ${settings.eventName} (${settings.edition})`);

  // -------------------------------------------------------------------- mats
  const matNames = ['Mat 1', 'Mat 2', 'Mat 3', 'Mat 4'];
  for (let i = 0; i < matNames.length; i++) {
    await db.mat.upsert({
      where: { name: matNames[i]! },
      update: { sortOrder: i },
      create: { name: matNames[i]!, venue: settings.venue, sortOrder: i },
    });
  }
  console.log(`  mats       ${matNames.length}`);

  // -------------------------------------------------------------- categories
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
          where: { code },
          update: { sortOrder: sortOrder++ },
          create: {
            code,
            name: `${AGE_SHORT[ageCategory]} ${GENDER_SHORT[gender]} ${label}`,
            event: 'KYORUGI',
            ageCategory,
            gender,
            weightMin: min,
            weightMax: max,
            weightLabel: label,
            sortOrder: sortOrder++,
          },
        });
        categoryCount++;
      }

      // Open (heaviest) division
      const open = bounds[bounds.length - 1]!;
      const openCode = `KYO-${ageCategory.slice(0, 3)}-${gender[0]}-P${open}`;
      await db.category.upsert({
        where: { code: openCode },
        update: { sortOrder: sortOrder++ },
        create: {
          code: openCode,
          name: `${AGE_SHORT[ageCategory]} ${GENDER_SHORT[gender]} +${open} kg`,
          event: 'KYORUGI',
          ageCategory,
          gender,
          weightMin: open,
          weightMax: null,
          weightLabel: `+${open} kg`,
          sortOrder: sortOrder++,
        },
      });
      categoryCount++;

      // Poomsae — individual recognised poomsae per age × gender
      const pooCode = `POO-${ageCategory.slice(0, 3)}-${gender[0]}-RECO`;
      await db.category.upsert({
        where: { code: pooCode },
        update: { sortOrder: sortOrder++ },
        create: {
          code: pooCode,
          name: `${AGE_SHORT[ageCategory]} ${GENDER_SHORT[gender]} Individual Poomsae`,
          event: 'POOMSAE',
          ageCategory,
          gender,
          poomsaeType: 'RECOGNISED',
          sortOrder: sortOrder++,
        },
      });
      categoryCount++;
    }
  }
  console.log(`  categories ${categoryCount}`);

  // ------------------------------------------------------------ super admin
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@prsnair-taekwondo.org';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';

  await db.user.upsert({
    where: { email: adminEmail },
    update: { role: 'SUPER_ADMIN', active: true },
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      name: 'Nihal Singh',
      role: 'SUPER_ADMIN',
    },
  });
  console.log(`  admin      ${adminEmail}`);

  // ------------------------------------------------- referees / jury panel
  const mats = await db.mat.findMany({ orderBy: { sortOrder: 'asc' } });
  const officials = [
    { name: 'R. Menon', email: 'referee1@prsnair-taekwondo.org', cert: 'WT Level 1', mat: 0, jury: true },
    { name: 'S. Kaur', email: 'referee2@prsnair-taekwondo.org', cert: 'National Referee', mat: 1, jury: true },
    { name: 'A. Fernandes', email: 'referee3@prsnair-taekwondo.org', cert: 'State Referee', mat: 2, jury: true },
    { name: 'D. Bhatt', email: 'referee4@prsnair-taekwondo.org', cert: 'State Referee', mat: 3, jury: true },
    { name: 'P. Iyer', email: 'jury1@prsnair-taekwondo.org', cert: 'Poomsae Judge', mat: 0, jury: true },
  ];

  for (const official of officials) {
    await db.user.upsert({
      where: { email: official.email },
      update: { assignedMatId: mats[official.mat]?.id ?? null, active: true },
      create: {
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

  // --------------------------------------------------------- demo school
  const demoEmail = 'coach@sacredheart.edu.in';
  let demoSchool = await db.school.findFirst({ where: { code: 'SHS' } });

  if (!demoSchool) {
    demoSchool = await db.school.create({
      data: {
        code: 'SHS',
        name: 'Sacred Heart School',
        boardAffiliation: 'CBSE',
        address: '12 Convent Road',
        city: 'Kalyan',
        state: 'Maharashtra',
        principalName: 'Sr. Teresa Mathew',
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
          code: `TKD${EDITION.slice(-2)}-${String(n).padStart(4, '0')}`,
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

      // Kyorugi entry
      const kyorugi = await db.category.findFirst({
        where: {
          event: 'KYORUGI',
          ageCategory,
          gender: athlete.gender,
          active: true,
          OR: [{ weightMax: { gte: athlete.weight } }, { weightMax: null }],
        },
        orderBy: { weightMax: 'asc' },
      });
      if (kyorugi) await db.entry.create({ data: { participantId: participant.id, categoryId: kyorugi.id } });

      // Poomsae entry for a subset
      if (n % 2 === 1) {
        const poomsae = await db.category.findFirst({
          where: { event: 'POOMSAE', ageCategory, gender: athlete.gender, active: true },
        });
        if (poomsae) await db.entry.create({ data: { participantId: participant.id, categoryId: poomsae.id } });
      }
    }

    // Coach accreditation
    await db.participant.create({
      data: {
        code: `TKD${EDITION.slice(-2)}-${String(n + 1).padStart(4, '0')}`,
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

    console.log(`  demo       Sacred Heart School — ${demoAthletes.length} athletes + 1 coach (${demoEmail} / School@123)`);
  } else {
    console.log('  demo       already present, left untouched');
  }

  console.log('\n✓ Seed complete\n');
  console.log('  Super Admin  ', adminEmail, '/', adminPassword);
  console.log('  School       ', demoEmail, '/ School@123');
  console.log('  Referee      ', 'referee1@prsnair-taekwondo.org / Referee@123');
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
