/**
 * Full-tournament simulation: 1000 athletes, every module, concurrent writes.
 *
 * Runs against the LOCAL database against its own Event, so it exercises
 * multi-event isolation alongside the demo event and can be removed with a
 * single cascade delete at the end.
 */
import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { db } from '../lib/db';
import { seedEventStructure } from '../lib/event-setup';
import { deriveEventShortCode, deriveEventSlug, nextParticipantCode } from '../lib/codes';
import { recalcSchoolFees, schoolReadiness } from '../lib/school-service';
import {
  autoSchedule,
  detectScheduleConflicts,
  generateDraw,
  recordBoutResult,
  renumberBouts,
  reopenBoutChain,
  finalizePoomsae,
  syncParticipantEntries,
} from '../lib/tournament';
import { championSchool, eventStats, medalTally } from '../lib/medals';
import { ageOn } from '../lib/age';
import { issueCertificatesForCategory } from '../lib/certificates';

const ATHLETES = 1000;
const SCHOOLS = 40;
const CONCURRENCY = 24; // simultaneous writers

const problems: string[] = [];
const t0 = Date.now();
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

const report: string[] = [];
function check(label: string, ok: boolean, detail = '') {
  report.push(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
}
function phase(n: string) {
  report.push(`\n[${stamp()}] ${n}`);
}
function note(line: string) {
  report.push(`     ${line}`);
}

/** Runs `fn` over `items` with a fixed number of workers in flight. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

const FIRST = ['Aarav','Ishaan','Kabir','Vivaan','Ananya','Diya','Sara','Riya','Arjun','Meera','Rohan','Kiara','Advik','Anika','Vihaan','Myra','Reyansh','Aadhya','Krishna','Pari'];
const LAST  = ['Sharma','Verma','Nair','Rao','Desai','Kulkarni','Menon','Joshi','Pillai','Iyer','Reddy','Gupta','Patel','Singh','Bose','Ghosh','Chopra','Malhotra','Naidu','Shetty'];
const BELTS = ['White','Yellow','Green','Blue','Red','Black 1st Dan'];
const CITIES = ['Mumbai','Pune','Nashik','Thane','Nagpur','Kalyan','Solapur','Aurangabad'];

/** Age reference is 31 Dec 2027; Youth <=11, Cadet 12-14, Junior 15-17. */
function dobFor(band: 'YOUTH' | 'CADET' | 'JUNIOR', i: number): Date {
  const age = band === 'YOUTH' ? 10 + (i % 2) : band === 'CADET' ? 12 + (i % 3) : 15 + (i % 3);
  return new Date(Date.UTC(2027 - age, (i % 12), 1 + (i % 27)));
}
function weightFor(band: 'YOUTH' | 'CADET' | 'JUNIOR', i: number): number {
  const base = band === 'YOUTH' ? 20 : band === 'CADET' ? 30 : 44;
  const spread = band === 'YOUTH' ? 24 : band === 'CADET' ? 36 : 36;
  return base + (i * 7) % spread + 1;
}

async function main(): Promise<string> {
  report.push(`Simulation — ${ATHLETES} athletes, ${SCHOOLS} schools, concurrency ${CONCURRENCY}`);

  // ---------------------------------------------------------------- phase 1
  phase('1. Create the event and its division grid');
  const slug = await deriveEventSlug('Simulation Open 2027');
  const shortCode = await deriveEventShortCode('Simulation Open', '2027');
  const event = await db.event.create({
    data: {
      slug, shortCode,
      eventName: 'Simulation Open', edition: '2027',
      organiser: 'Load Test Federation', venue: 'Simulation Arena',
      startDate: new Date('2027-03-05'), endDate: new Date('2027-03-07'),
      registrationOpensAt: new Date('2026-12-01'),
      registrationClosesAt: new Date('2027-02-20'),
      ageReferenceDate: new Date('2027-12-31'),
      feePerParticipant: 500,
      isPublic: true,
    },
  });
  const structure = await seedEventStructure(event.id, event.venue);

  // AuditLog carries a real FK to User, so the simulation needs real actors.
  const actorHash = await bcrypt.hash('Sim@123456', 10);
  const organiser = await db.user.create({
    data: { eventId: event.id, email: 'organiser@simulation.test', passwordHash: actorHash, name: 'Sim Organiser', role: 'REFEREE' },
  });
  const matReferee = await db.user.create({
    data: { eventId: event.id, email: 'referee@simulation.test', passwordHash: actorHash, name: 'Sim Referee', role: 'REFEREE' },
  });
  const ACTOR = organiser.id;
  const REF = matReferee.id;
  check('event created with full division grid', structure.categories === 64 && structure.mats === 4,
    `${structure.categories} divisions, ${structure.mats} mats`);

  // ---------------------------------------------------------------- phase 2
  phase(`2. Register ${SCHOOLS} schools concurrently`);
  const hash = await bcrypt.hash('School@123', 10);
  const schools = await pool(Array.from({ length: SCHOOLS }, (_, i) => i), CONCURRENCY, async (i) => {
    const name = `Simulation Academy ${String(i + 1).padStart(2, '0')}`;
    const school = await db.school.create({
      data: {
        eventId: event.id,
        code: `SIM${String(i + 1).padStart(2, '0')}`,
        name,
        city: CITIES[i % CITIES.length]!,
        state: 'Maharashtra',
        coachName: `Coach ${LAST[i % LAST.length]}`,
        coachPhone: `98${String(10000000 + i)}`,
        contactEmail: `coach${i + 1}@simulation.test`,
        status: 'PENDING',
      },
    });
    await db.user.create({
      data: {
        eventId: event.id, schoolId: school.id,
        email: `coach${i + 1}@simulation.test`,
        passwordHash: hash, name: `Coach ${LAST[i % LAST.length]}`, role: 'SCHOOL',
      },
    });
    return school;
  });
  check('all schools registered', schools.length === SCHOOLS, `${schools.length} schools`);
  const dupCodes = new Set(schools.map((s) => s.code)).size;
  check('school codes are unique', dupCodes === SCHOOLS, `${dupCodes} distinct`);

  // ---------------------------------------------------------------- phase 3
  phase(`3. Enter ${ATHLETES} athletes concurrently (plus a coach per school)`);
  const bands: ('YOUTH' | 'CADET' | 'JUNIOR')[] = ['YOUTH', 'CADET', 'JUNIOR'];
  const specs = Array.from({ length: ATHLETES }, (_, i) => ({
    i,
    school: schools[i % SCHOOLS]!,
    band: bands[i % 3]!,
    gender: (i % 2 === 0 ? 'MALE' : 'FEMALE') as 'MALE' | 'FEMALE',
  }));

  const athletes = await pool(specs, CONCURRENCY, async (spec) => {
    const { i, school, band, gender } = spec;
    return db.participant.create({
      data: {
        schoolId: school.id,
        code: await nextParticipantCode(event.id),
        name: `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`,
        dob: dobFor(band, i),
        gender,
        ageCategory: band,
        ageAtRef: ageOn(dobFor(band, i), event.ageReferenceDate),
        weightKg: weightFor(band, i),
        beltGrade: BELTS[i % BELTS.length]!,
        personRole: 'ATHLETE',
        status: 'APPROVED',
        emergencyContactPhone: `99${String(10000000 + i)}`,
        photoPath: i % 10 === 0 ? null : `/uploads/photos/sim-${i}.jpg`,
      },
    });
  });
  check('all athletes created', athletes.length === ATHLETES, `${athletes.length}`);

  const codes = await db.participant.findMany({ where: { school: { eventId: event.id } }, select: { code: true } });
  check('participant codes are unique under concurrency',
    new Set(codes.map((c) => c.code)).size === codes.length,
    `${new Set(codes.map((c) => c.code)).size} distinct of ${codes.length}`);

  await pool(schools, CONCURRENCY, async (school, i) =>
    db.participant.create({
      data: {
        schoolId: school.id,
        code: await nextParticipantCode(event.id),
        name: `Coach ${LAST[i % LAST.length]}`,
        dob: new Date(Date.UTC(1985, i % 12, 12)),
        gender: i % 2 ? 'FEMALE' : 'MALE',
        ageCategory: 'JUNIOR',
        ageAtRef: ageOn(new Date(Date.UTC(1985, i % 12, 12)), event.ageReferenceDate),
        weightKg: 70,
        beltGrade: 'Black 1st Dan',
        personRole: 'COACH',
        status: 'APPROVED',
        emergencyContactPhone: `97${String(10000000 + i)}`,
      },
    }),
  );

  // ---------------------------------------------------------------- phase 4
  phase('4. Approve schools, recalculate fees, record payments');
  await pool(schools, CONCURRENCY, async (school) => {
    await db.school.update({ where: { id: school.id }, data: { status: 'APPROVED' } });
    await recalcSchoolFees(school.id);
  });
  const approved = await db.school.count({ where: { eventId: event.id, status: 'APPROVED' } });
  check('every school approved', approved === SCHOOLS, `${approved}`);

  const feeRows = await db.school.findMany({ where: { eventId: event.id }, select: { amountDue: true } });
  const totalDue = feeRows.reduce((s, r) => s + r.amountDue, 0);
  const expectedDue = ATHLETES * event.feePerParticipant; // coaches are accredited, not charged
  check('fees computed across all schools', totalDue === expectedDue,
    `due ${totalDue} vs expected ${expectedDue}`);

  await pool(schools, CONCURRENCY, async (school) => {
    const s = await db.school.findUniqueOrThrow({ where: { id: school.id } });
    await db.payment.create({
      data: { schoolId: school.id, amount: s.amountDue, method: 'UPI', reference: `UPI-${school.code}`, paidAt: new Date() },
    });
    await recalcSchoolFees(school.id);
  });
  const paidCount = await db.school.count({ where: { eventId: event.id, paymentStatus: 'PAID' } });
  check('every school marked paid', paidCount === SCHOOLS, `${paidCount}`);

  // ---------------------------------------------------------------- phase 5
  phase('5. Assign athletes to divisions concurrently');
  const syncs = await pool(athletes, CONCURRENCY, (a) => syncParticipantEntries(a.id, ['KYORUGI', 'POOMSAE']));
  const unplaced = syncs.filter((s) => s.created.length === 0).length;
  const warnings = syncs.flatMap((s) => s.warnings);
  const entryCount = await db.entry.count({ where: { category: { eventId: event.id } } });
  check('every athlete landed in at least one division', unplaced === 0,
    `${unplaced} unplaced, ${entryCount} entries, ${warnings.length} warnings`);
  if (warnings.length) note(`sample warning: ${warnings[0]}`);

  const readiness = await schoolReadiness(schools[0]!.id);
  check('readiness check runs over a full squad', Array.isArray(readiness.issues),
    `${readiness.issues.length} issues on school 1`);

  // ---------------------------------------------------------------- phase 6
  phase('6. Generate every draw concurrently');
  const drawable = await db.category.findMany({
    where: { eventId: event.id, entries: { some: { status: 'ACTIVE' } } },
    select: { id: true, discipline: true, name: true },
  });
  const draws = await pool(drawable, CONCURRENCY, (c) => generateDraw(c.id, 'BELT', ACTOR));
  const drawFailures = draws.filter((d) => !d.ok);
  check('all draws generated', drawFailures.length === 0,
    `${draws.length - drawFailures.length}/${draws.length} ok`);
  if (drawFailures.length) note(`first failure: ${(drawFailures[0] as { error: string }).error}`);

  const kyo = drawable.filter((c) => c.discipline === 'KYORUGI');
  let bracketProblems = 0;
  for (const c of kyo) {
    const bouts = await db.bout.findMany({ where: { categoryId: c.id } });
    if (!bouts.length) continue;
    const entrants = await db.entry.count({ where: { categoryId: c.id, status: 'ACTIVE' } });
    const size = 1 << Math.ceil(Math.log2(Math.max(2, entrants)));
    if (bouts.length !== size - 1) bracketProblems++;
    const finals = bouts.filter((b) => b.round === Math.max(...bouts.map((x) => x.round)));
    if (finals.length !== 1) bracketProblems++;
  }
  check('every bracket is well formed', bracketProblems === 0,
    `${kyo.length} Kyorugi brackets checked`);

  await db.category.updateMany({ where: { eventId: event.id, drawStatus: 'GENERATED' }, data: { drawStatus: 'PUBLISHED' } });
  const renumbered = await renumberBouts(event.id);
  check('bouts numbered across the event', renumbered > 0, `${renumbered} bouts`);

  // ---------------------------------------------------------------- phase 7
  phase('7. Schedule onto mats');
  const scheduled = await autoSchedule(event.id, new Date('2027-03-05T09:00:00Z'), 6);
  const conflicts = await detectScheduleConflicts(event.id);
  check('bouts scheduled onto mats', scheduled > 0, `${scheduled} bouts`);
  check('no scheduling conflicts', conflicts.length === 0, `${conflicts.length} conflicts`);

  // ------------------------------------------------------- phase 8 (the point)
  phase('8. Score the whole tournament — referees submitting in parallel');
  let round = 0;
  let played = 0;
  const roundTimes: string[] = [];

  for (;;) {
    const ready = await db.bout.findMany({
      where: {
        category: { eventId: event.id, discipline: 'KYORUGI', finalized: false },
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
        redEntryId: { not: null },
        blueEntryId: { not: null },
      },
      select: { id: true },
    });
    if (!ready.length) break;
    round++;
    const rt = Date.now();

    // Every bout in this wave goes in at once — the concurrency case that
    // matters, since a real venue has four mats submitting together.
    const results = await pool(ready, CONCURRENCY, (b, i) =>
      recordBoutResult({
        boutId: b.id,
        winner: i % 2 === 0 ? 'RED' : 'BLUE',
        resultType: i % 37 === 0 ? 'WALKOVER' : 'POINTS',
        redScore: i % 2 === 0 ? 8 : 3,
        blueScore: i % 2 === 0 ? 3 : 8,
        redGamJeom: i % 5 === 0 ? 1 : 0,
        blueGamJeom: 0,
        rounds: [
          { roundNo: 1, redPoints: i % 2 === 0 ? 4 : 1, bluePoints: i % 2 === 0 ? 1 : 4, redGamJeom: 0, blueGamJeom: 0 },
          { roundNo: 2, redPoints: i % 2 === 0 ? 4 : 2, bluePoints: i % 2 === 0 ? 2 : 4, redGamJeom: 0, blueGamJeom: 0 },
        ],
        actorId: REF,
      }),
    );
    const failed = results.filter((r) => !r.ok);
    played += results.length - failed.length;
    roundTimes.push(`r${round}:${ready.length}b/${((Date.now() - rt) / 1000).toFixed(1)}s`);
    if (failed.length) {
      note(`round ${round}: ${failed.length} rejected — ${(failed[0] as { error: string }).error}`);
    }
    if (round > 15) break;
  }
  check('every Kyorugi bout played', played > 0, `${played} bouts over ${round} waves`);
  note(roundTimes.join('  '));

  const stuck = await db.bout.count({
    where: { category: { eventId: event.id, discipline: 'KYORUGI' }, status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
  });
  check('no Kyorugi bout left unplayed', stuck === 0, `${stuck} still open`);

  // ---------------------------------------------------------------- phase 9
  phase('9. Poomsae — judge panels scoring in parallel');
  const poomsae = await db.category.findMany({
    where: { eventId: event.id, discipline: 'POOMSAE', entries: { some: {} } },
    select: { id: true },
  });
  const judges = await pool(Array.from({ length: 5 }, (_, j) => j), 5, (j) =>
    db.user.create({
      data: {
        eventId: event.id, email: `judge${j + 1}@simulation.test`,
        passwordHash: hash, name: `Judge ${j + 1}`, role: 'REFEREE', isJury: true,
      },
    }),
  );

  await pool(poomsae, CONCURRENCY, async (c) => {
    const entries = await db.entry.findMany({ where: { categoryId: c.id, status: 'ACTIVE' }, select: { id: true } });
    // Scores must differ per athlete, or every entry ties on rank 1 and the
    // whole division is awarded gold — correct tie handling, useless as data.
    let seat = 0;
    for (const e of entries) {
      seat++;
      await Promise.all(
        judges.map((j, k) =>
          db.poomsaeScore.upsert({
            where: { entryId_judgeId: { entryId: e.id, judgeId: j.id } },
            update: {},
            create: (() => {
              // The app stores total = accuracy + presentation (see
              // submitPoomsaeScore); the trimmed mean is computed from total.
              const accuracy = 3.2 + ((seat * 13 + k * 7) % 17) / 20;
              const presentation = 3.1 + ((seat * 7 + k * 3) % 19) / 20;
              return {
                entryId: e.id, judgeId: j.id, accuracy, presentation,
                total: Math.round((accuracy + presentation) * 100) / 100,
              };
            })(),
          }),
        ),
      );
    }
  });
  const poomsaeFinals = await pool(poomsae, CONCURRENCY, (c) => finalizePoomsae(c.id, ACTOR));
  const pFail = poomsaeFinals.filter((r) => !r.ok);
  check('every Poomsae division ranked', pFail.length === 0,
    `${poomsaeFinals.length - pFail.length}/${poomsaeFinals.length}`);
  if (pFail.length) note(`first failure: ${(pFail[0] as { error: string }).error}`);

  // --------------------------------------------------------------- phase 10
  phase('10. Medals');
  const finalized = await db.category.count({ where: { eventId: event.id, finalized: true } });
  const allCats = await db.category.count({ where: { eventId: event.id, entries: { some: {} } } });
  check('all contested divisions finalised', finalized === allCats, `${finalized}/${allCats}`);

  let medalProblems: string[] = [];
  const withEntries = await db.category.findMany({
    where: { eventId: event.id, finalized: true, discipline: 'KYORUGI' },
    select: { id: true, name: true, _count: { select: { entries: true } } },
  });
  for (const c of withEntries) {
    const rs = await db.result.findMany({ where: { categoryId: c.id }, select: { medal: true } });
    const g = rs.filter((r) => r.medal === 'GOLD').length;
    const s = rs.filter((r) => r.medal === 'SILVER').length;
    const br = rs.filter((r) => r.medal === 'BRONZE').length;

    // WT awards a bronze to each semi-final loser — so the expected count is the
    // number of semi-finals actually contested. A bye in the semis leaves no loser.
    const bouts = await db.bout.findMany({ where: { categoryId: c.id }, select: { round: true, status: true } });
    const maxRound = Math.max(...bouts.map((b) => b.round));
    const contestedSemis = bouts.filter((b) => b.round === maxRound - 1 && b.status === 'COMPLETED').length;

    if (g !== 1) medalProblems.push(`${c.name}: ${g} gold`);
    if (c._count.entries >= 2 && s !== 1) medalProblems.push(`${c.name}: ${s} silver`);
    if (br !== contestedSemis) medalProblems.push(`${c.name}: ${br} bronze for ${contestedSemis} semi-final(s)`);
  }
  check('WT medal rules hold in every division', medalProblems.length === 0,
    medalProblems.slice(0, 3).join('; ') || `${withEntries.length} divisions`);

  const tally = await medalTally(event.id, event);
  const champ = await championSchool(event.id, event);
  const stats = await eventStats(event.id);
  check('medal tally computed', tally.rows.length > 0,
    `${tally.rows.length} schools, ${tally.totals.gold}G ${tally.totals.silver}S ${tally.totals.bronze}B`);
  check('champion school resolved', champ !== null, champ ? `${champ.schoolName} (${champ.points} pts)` : '');
  check('event stats computed', stats != null);

  // --------------------------------------------------------------- phase 11
  phase('11. Certificates');
  const certCats = await db.category.findMany({ where: { eventId: event.id, finalized: true }, select: { id: true } });
  const issued = await pool(certCats, CONCURRENCY, (c) => issueCertificatesForCategory(event, c.id, ACTOR));
  const iFail = issued.filter((r) => !r.ok);
  const created = issued.reduce((s, r) => s + (r.ok ? r.created : 0), 0);
  check('certificates issued for every division', iFail.length === 0, `${created} certificates`);

  const certNos = await db.certificate.findMany({
    where: { participant: { school: { eventId: event.id } } }, select: { certNo: true },
  });
  check('certificate numbers are unique under concurrency',
    new Set(certNos.map((c) => c.certNo)).size === certNos.length,
    `${new Set(certNos.map((c) => c.certNo)).size} distinct of ${certNos.length}`);

  // --------------------------------------------------------------- phase 12
  phase('12. The bracket-correction guard, under real data');
  const target = await db.bout.findFirst({
    where: { category: { eventId: event.id, discipline: 'KYORUGI' }, status: 'COMPLETED', nextBoutId: { not: null } },
    include: { nextBout: true },
  });
  if (!target) {
    check('found a corrected-bout candidate', false, 'no completed bout with a downstream bout');
  } else {
    const flipTo = target.winnerEntryId === target.redEntryId ? 'BLUE' : 'RED';
    const refused = await recordBoutResult({
      boutId: target.id, winner: flipTo as 'RED' | 'BLUE', resultType: 'POINTS',
      redScore: 1, blueScore: 9, actorId: ACTOR,
    });
    check('flipping a winner is refused once later bouts are fought', !refused.ok,
      refused.ok ? 'ALLOWED' : (refused as { error: string }).error.slice(0, 70));

    const reopened = await reopenBoutChain(target.id, ACTOR);
    check('reopening the chain succeeds', reopened.ok,
      reopened.ok ? `${reopened.reopened} bouts reopened` : (reopened as { error: string }).error);

    const redo = await recordBoutResult({
      boutId: target.id, winner: flipTo as 'RED' | 'BLUE', resultType: 'POINTS',
      redScore: 1, blueScore: 9, actorId: ACTOR,
    });
    check('the corrected result is then accepted', redo.ok,
      redo.ok ? '' : (redo as { error: string }).error.slice(0, 70));
  }

  // --------------------------------------------------------------- summary
  phase('Summary');
  const counts = {
    schools: await db.school.count({ where: { eventId: event.id } }),
    participants: await db.participant.count({ where: { school: { eventId: event.id } } }),
    entries: await db.entry.count({ where: { category: { eventId: event.id } } }),
    bouts: await db.bout.count({ where: { category: { eventId: event.id } } }),
    results: await db.result.count({ where: { category: { eventId: event.id } } }),
    certificates: await db.certificate.count({ where: { participant: { school: { eventId: event.id } } } }),
    audit: await db.auditLog.count({ where: { eventId: event.id } }),
  };
  note(JSON.stringify(counts));

  // isolation: the demo event must be untouched
  const other = await db.event.findFirst({ where: { slug: { not: slug } }, select: { id: true, slug: true } });
  if (other) {
    const leaked = await db.participant.count({
      where: { school: { eventId: other.id }, code: { startsWith: event.shortCode } },
    });
    check('no simulation data leaked into the other event', leaked === 0, `${leaked} leaked`);
  }

  report.push(`\n[${stamp()}] ${problems.length ? `${problems.length} PROBLEM(S): ${problems.join(' | ')}` : 'All checks passed'}`);
  return report.join('\n');
}

describe('full tournament simulation', () => {
  it(
    `runs ${ATHLETES} athletes through every module with concurrent writers`,
    async () => {
      const log = await main();
      // vitest buffers console output on a passing test, so write the report out.
      const { writeFileSync } = await import('node:fs');
      writeFileSync('.sim-report.txt', log);
      process.stdout.write(`\n${log}\n`);
      expect(problems).toEqual([]);
    },
    30 * 60_000,
  );
});
