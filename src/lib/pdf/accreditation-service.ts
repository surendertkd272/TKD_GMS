import 'server-only';
import { db, getSettings } from '@/lib/db';
import { buildBatchCardPdf, buildSingleCardPdf, type CardData, type CardEvent } from './card';
import { fmtDate } from '@/lib/format';

export async function cardEventContext(): Promise<CardEvent> {
  const settings = await getSettings();
  const sameDay = fmtDate(settings.startDate) === fmtDate(settings.endDate);
  return {
    eventName: settings.eventName,
    edition: settings.edition,
    venue: settings.venue,
    dateLabel: sameDay ? fmtDate(settings.startDate) : `${fmtDate(settings.startDate)} – ${fmtDate(settings.endDate)}`,
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000',
  };
}

/** Only approved schools get cards — accreditation is gated on approval. */
export async function cardDataForSchool(schoolId: string): Promise<CardData[]> {
  const participants = await db.participant.findMany({
    where: { schoolId, status: 'APPROVED', school: { status: 'APPROVED' } },
    include: {
      school: { select: { name: true, code: true } },
      entries: { include: { category: { select: { event: true } } } },
    },
    orderBy: [{ personRole: 'asc' }, { name: 'asc' }],
  });
  return participants.map(toCardData);
}

export async function cardDataForAll(): Promise<CardData[]> {
  const participants = await db.participant.findMany({
    where: { status: 'APPROVED', school: { status: 'APPROVED' } },
    include: {
      school: { select: { name: true, code: true } },
      entries: { include: { category: { select: { event: true } } } },
    },
    orderBy: [{ school: { name: 'asc' } }, { personRole: 'asc' }, { name: 'asc' }],
  });
  return participants.map(toCardData);
}

export async function cardDataForParticipant(participantId: string): Promise<CardData | null> {
  const participant = await db.participant.findUnique({
    where: { id: participantId },
    include: {
      school: { select: { name: true, code: true } },
      entries: { include: { category: { select: { event: true } } } },
    },
  });
  return participant ? toCardData(participant) : null;
}

type ParticipantRow = {
  code: string;
  name: string;
  ageCategory: string;
  gender: string;
  weightKg: number;
  beltGrade: string;
  personRole: string;
  photoPath: string | null;
  accreditationVersion: number;
  school: { name: string; code: string };
  entries: { category: { event: string } }[];
};

function toCardData(participant: ParticipantRow): CardData {
  const events = [...new Set(participant.entries.map((e) => (e.category.event === 'KYORUGI' ? 'Kyorugi' : 'Poomsae')))];
  return {
    code: participant.code,
    name: participant.name,
    schoolName: participant.school.name,
    schoolCode: participant.school.code,
    ageCategory: participant.ageCategory,
    gender: participant.gender,
    weightKg: participant.weightKg,
    beltGrade: participant.beltGrade,
    personRole: participant.personRole,
    events,
    photoPath: participant.photoPath,
    version: participant.accreditationVersion,
  };
}

export async function renderSingleCard(participantId: string): Promise<Uint8Array | null> {
  const [data, event] = await Promise.all([cardDataForParticipant(participantId), cardEventContext()]);
  if (!data) return null;
  return buildSingleCardPdf(data, event);
}

export async function renderBatchSheet(cards: CardData[]): Promise<Uint8Array> {
  return buildBatchCardPdf(cards, await cardEventContext());
}

/** Individual-size cards concatenated into one file, one card per page. */
export async function renderIndividualCards(cards: CardData[]): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const event = await cardEventContext();
  const merged = await PDFDocument.create();
  merged.setTitle(`Accreditation cards — ${cards.length}`);

  for (const card of cards) {
    const single = await PDFDocument.load(await buildSingleCardPdf(card, event));
    const [page] = await merged.copyPages(single, [0]);
    merged.addPage(page);
  }

  if (cards.length === 0) merged.addPage([242, 153]);
  return merged.save();
}
