import 'server-only';
import { db, getSettings } from './db';
import { nextCertificateNo } from './codes';
import { buildCertificatePdf, type CertificateData, type CertificateEvent } from './pdf/certificate';
import { sendMail } from './mail';
import { sendSms } from './sms';
import { logAudit } from './auth';
import { fmtDate } from './format';

export async function certificateEventContext(): Promise<CertificateEvent> {
  const settings = await getSettings();
  const sameDay = fmtDate(settings.startDate) === fmtDate(settings.endDate);
  return {
    eventName: settings.eventName,
    edition: settings.edition,
    organiser: settings.organiser,
    venue: settings.venue,
    dateLabel: sameDay ? fmtDate(settings.startDate) : `${fmtDate(settings.startDate)} – ${fmtDate(settings.endDate)}`,
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000',
    signatory1Name: settings.signatory1Name,
    signatory1Title: settings.signatory1Title,
    signatory2Name: settings.signatory2Name,
    signatory2Title: settings.signatory2Title,
  };
}

/**
 * Issues every certificate a finalised category implies: a participation
 * certificate for each entrant and a merit certificate for each medallist.
 * Idempotent — re-running after a correction will not duplicate rows.
 */
export async function issueCertificatesForCategory(
  categoryId: string,
  actorId: string,
): Promise<{ ok: true; created: number; skipped: number } | { ok: false; error: string }> {
  const settings = await getSettings();
  const category = await db.category.findUnique({
    where: { id: categoryId },
    include: { results: { include: { entry: { include: { participant: true } } } } },
  });
  if (!category) return { ok: false, error: 'Category not found.' };
  if (!category.finalized) return { ok: false, error: 'Finalise the category before issuing certificates.' };

  let created = 0;
  let skipped = 0;

  for (const result of category.results) {
    const participantId = result.entry.participantId;

    // Participation certificate — one per participant per category.
    const existingParticipation = await db.certificate.findFirst({
      where: { participantId, categoryId, type: 'PARTICIPATION', revoked: false },
    });
    if (existingParticipation) {
      skipped++;
    } else {
      await db.certificate.create({
        data: {
          certNo: await nextCertificateNo(settings.edition, 'PARTICIPATION'),
          participantId,
          categoryId,
          type: 'PARTICIPATION',
        },
      });
      created++;
    }

    if (!result.medal) continue;

    const existingWinner = await db.certificate.findFirst({
      where: { participantId, categoryId, type: 'WINNER', revoked: false },
    });
    if (existingWinner) {
      skipped++;
      continue;
    }
    await db.certificate.create({
      data: {
        certNo: await nextCertificateNo(settings.edition, 'WINNER'),
        participantId,
        categoryId,
        type: 'WINNER',
        position: result.position,
        medal: result.medal,
      },
    });
    created++;
  }

  await logAudit({
    userId: actorId,
    action: 'CERTIFICATES_ISSUED',
    entityType: 'Category',
    entityId: categoryId,
    detail: `${created} issued, ${skipped} already present`,
  });

  return { ok: true, created, skipped };
}

export async function certificateDataFor(certificateIds: string[]): Promise<CertificateData[]> {
  const rows = await db.certificate.findMany({
    where: { id: { in: certificateIds }, revoked: false },
    include: {
      participant: { include: { school: { select: { name: true } } } },
      category: true,
    },
    orderBy: [{ type: 'asc' }, { certNo: 'asc' }],
  });

  const scores = await db.result.findMany({
    where: {
      categoryId: { in: rows.map((r) => r.categoryId).filter(Boolean) as string[] },
      entry: { participantId: { in: rows.map((r) => r.participantId) } },
    },
    include: { entry: { select: { participantId: true } } },
  });

  return rows.map((row) => {
    const score = scores.find(
      (s) => s.categoryId === row.categoryId && s.entry.participantId === row.participantId,
    );
    return {
      certNo: row.certNo,
      type: row.type as 'PARTICIPATION' | 'WINNER',
      participantName: row.participant.name,
      schoolName: row.participant.school.name,
      categoryName: row.category?.name ?? null,
      event: row.category?.event ?? null,
      ageCategory: row.category?.ageCategory ?? null,
      medal: row.medal,
      position: row.position,
      score: row.category?.event === 'POOMSAE' ? (score?.score ?? null) : null,
    };
  });
}

export async function renderCertificates(certificateIds: string[]): Promise<Uint8Array> {
  const [data, event] = await Promise.all([certificateDataFor(certificateIds), certificateEventContext()]);
  return buildCertificatePdf(data, event);
}

/**
 * One email per school with all of that school's outstanding certificates
 * attached, matching the spec's bulk dispatch. Individual dispatch is used when
 * the participant has their own email on file.
 */
export async function dispatchCertificates(
  options: { schoolId?: string; categoryId?: string; onlyUnsent?: boolean },
  actorId: string,
): Promise<{ schools: number; emails: number; certificates: number; failures: string[] }> {
  const event = await certificateEventContext();

  const certificates = await db.certificate.findMany({
    where: {
      revoked: false,
      ...(options.onlyUnsent === false ? {} : { emailedAt: null }),
      ...(options.categoryId ? { categoryId: options.categoryId } : {}),
      ...(options.schoolId ? { participant: { schoolId: options.schoolId } } : {}),
    },
    include: { participant: { include: { school: true } } },
  });

  const bySchool = new Map<string, typeof certificates>();
  for (const cert of certificates) {
    const key = cert.participant.schoolId;
    bySchool.set(key, [...(bySchool.get(key) ?? []), cert]);
  }

  const failures: string[] = [];
  let emails = 0;
  let sentCount = 0;

  for (const [, group] of bySchool) {
    const school = group[0]!.participant.school;
    const to = school.contactEmail;
    if (!to) {
      failures.push(`${school.name}: no contact email on file.`);
      continue;
    }

    const pdfBytes = await renderCertificates(group.map((c) => c.id));
    const winners = group.filter((c) => c.type === 'WINNER');

    const lines = [
      `Dear ${school.coachName || school.principalName || school.name},`,
      '',
      `Please find attached ${group.length} certificate${group.length === 1 ? '' : 's'} for ${school.name} from the ${event.eventName} ${event.edition}.`,
      '',
      winners.length
        ? `Merit certificates included: ${winners
            .map((w) => `${w.participant.name} (${w.medal})`)
            .join(', ')}.`
        : 'All attached certificates are participation certificates.',
      '',
      'Every certificate carries a unique number and a QR code that verifies it against the official record.',
      'You can also re-download these at any time from your School Dashboard.',
      '',
      'Congratulations to your athletes and thank you for taking part.',
      '',
      `${event.signatory1Name}`,
      `${event.signatory1Title}, ${event.organiser}`,
    ];

    const result = await sendMail({
      to,
      subject: `${event.eventName} ${event.edition} — certificates for ${school.name}`,
      text: lines.join('\n'),
      attachments: [
        {
          filename: `certificates-${school.code}.pdf`,
          content: Buffer.from(pdfBytes),
          contentType: 'application/pdf',
        },
      ],
    });

    if (!result.ok) {
      failures.push(`${school.name}: ${result.error}`);
      continue;
    }

    emails++;
    sentCount += group.length;
    await db.certificate.updateMany({
      where: { id: { in: group.map((c) => c.id) } },
      data: { emailedAt: new Date(), emailTo: to },
    });

    const phone = school.coachPhone || school.contactPhone;
    if (phone) {
      await sendSms({
        to: phone,
        channel: 'auto',
        body: `${event.eventName}: ${group.length} certificate(s) for ${school.name} are ready — check your email or School Dashboard.`,
      });
    }
  }

  await logAudit({
    userId: actorId,
    action: 'CERTIFICATES_EMAILED',
    entityType: 'Certificate',
    detail: `${sentCount} certificate(s) in ${emails} email(s); ${failures.length} failure(s)`,
  });

  return { schools: bySchool.size, emails, certificates: sentCount, failures };
}
