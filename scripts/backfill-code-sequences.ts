/**
 * Sets each event's code counters to the highest number already issued.
 *
 * Participant codes and certificate numbers used to be derived by scanning
 * existing rows; they now come from atomic counters on Event. Without this
 * backfill the counters start at zero and would reissue codes that already
 * exist. Safe to re-run.
 */
import { db } from '../src/lib/db';

function highest(codes: string[], prefix: string): number {
  let max = 0;
  for (const code of codes) {
    if (!code.startsWith(prefix)) continue;
    const n = Number.parseInt(code.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

async function main() {
  const events = await db.event.findMany({
    select: { id: true, shortCode: true, eventName: true, edition: true },
  });

  for (const event of events) {
    const [participants, certificates] = await Promise.all([
      db.participant.findMany({ where: { school: { eventId: event.id } }, select: { code: true } }),
      db.certificate.findMany({
        where: { participant: { school: { eventId: event.id } } },
        select: { certNo: true },
      }),
    ]);

    const participantSeq = highest(participants.map((p) => p.code), `${event.shortCode}-`);
    const certWinnerSeq = highest(certificates.map((c) => c.certNo), `${event.shortCode}-W-`);
    const certParticipationSeq = highest(certificates.map((c) => c.certNo), `${event.shortCode}-P-`);

    await db.event.update({
      where: { id: event.id },
      data: { participantSeq, certWinnerSeq, certParticipationSeq },
    });

    console.log(
      `  ${event.eventName} ${event.edition} (${event.shortCode}) → ` +
        `participants ${participantSeq}, winner certs ${certWinnerSeq}, participation certs ${certParticipationSeq}`,
    );
  }

  console.log(`\nBackfilled ${events.length} event(s).`);
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
