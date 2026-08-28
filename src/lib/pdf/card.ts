import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { A4, CARD, MM, embedPhoto, fitText, palette, qrPng, truncate } from './shared';
import { AGE_CATEGORY_SHORT, type AgeCategory } from '../constants';

export type CardData = {
  code: string;
  name: string;
  schoolName: string;
  schoolCode: string;
  ageCategory: string;
  gender: string;
  weightKg: number;
  beltGrade: string;
  personRole: string;
  events: string[];
  photoPath: string | null;
  version: number;
};

export type CardEvent = {
  eventName: string;
  edition: string;
  venue: string;
  dateLabel: string;
  baseUrl: string;
};

const ROLE_COLOR: Record<string, { r: number; g: number; b: number }> = {
  ATHLETE: palette.red,
  COACH: palette.blue,
  OFFICIAL: palette.ink,
  VOLUNTEER: palette.gold,
};

/**
 * Draws one accreditation card at (x, y) = bottom-left corner. Kept separate
 * from page setup so the same routine serves single cards and batch sheets.
 */
async function drawCard(
  doc: PDFDocument,
  page: PDFPage,
  x: number,
  y: number,
  data: CardData,
  event: CardEvent,
  fonts: { regular: PDFFont; bold: PDFFont },
) {
  const W = CARD.width;
  const H = CARD.height;
  const { regular, bold } = fonts;
  const roleColor = ROLE_COLOR[data.personRole] ?? palette.ink;

  // Card body + cut border
  page.drawRectangle({ x, y, width: W, height: H, color: rgb(palette.white.r, palette.white.g, palette.white.b) });
  page.drawRectangle({
    x,
    y,
    width: W,
    height: H,
    borderColor: rgb(palette.line.r, palette.line.g, palette.line.b),
    borderWidth: 0.5,
  });

  // ---- Header band ----
  const headerH = 13 * MM;
  page.drawRectangle({
    x,
    y: y + H - headerH,
    width: W,
    height: headerH,
    color: rgb(palette.red.r, palette.red.g, palette.red.b),
  });

  const pad = 3.2 * MM;
  const titleSize = fitText(event.eventName.toUpperCase(), bold, W - pad * 2, 7.4);
  page.drawText(event.eventName.toUpperCase(), {
    x: x + pad,
    y: y + H - headerH + 7.4 * MM,
    size: titleSize,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText(`${event.edition}  ·  ${truncate(event.venue, 44)}`, {
    x: x + pad,
    y: y + H - headerH + 3.9 * MM,
    size: 5.2,
    font: regular,
    color: rgb(1, 1, 1),
  });
  page.drawText(event.dateLabel, {
    x: x + pad,
    y: y + H - headerH + 1.5 * MM,
    size: 5.2,
    font: regular,
    color: rgb(1, 1, 1),
  });

  // ---- Photo ----
  const photoW = 19 * MM;
  const photoH = 24 * MM;
  const photoX = x + pad;
  const photoY = y + H - headerH - photoH - 2.6 * MM;

  const photo = await embedPhoto(doc, data.photoPath);
  if (photo) {
    page.drawImage(photo, { x: photoX, y: photoY, width: photoW, height: photoH });
  } else {
    page.drawRectangle({
      x: photoX,
      y: photoY,
      width: photoW,
      height: photoH,
      color: rgb(palette.wash.r, palette.wash.g, palette.wash.b),
    });
    page.drawText('PHOTO', {
      x: photoX + photoW / 2 - regular.widthOfTextAtSize('PHOTO', 5.5) / 2,
      y: photoY + photoH / 2 - 2,
      size: 5.5,
      font: regular,
      color: rgb(palette.muted.r, palette.muted.g, palette.muted.b),
    });
  }
  page.drawRectangle({
    x: photoX,
    y: photoY,
    width: photoW,
    height: photoH,
    borderColor: rgb(palette.line.r, palette.line.g, palette.line.b),
    borderWidth: 0.5,
  });

  // ---- Role tag under the photo ----
  const tagH = 4.4 * MM;
  page.drawRectangle({
    x: photoX,
    y: photoY - tagH - 1.2 * MM,
    width: photoW,
    height: tagH,
    color: rgb(roleColor.r, roleColor.g, roleColor.b),
  });
  const roleText = data.personRole;
  page.drawText(roleText, {
    x: photoX + photoW / 2 - bold.widthOfTextAtSize(roleText, 5.8) / 2,
    y: photoY - tagH - 1.2 * MM + 1.5 * MM,
    size: 5.8,
    font: bold,
    color: rgb(1, 1, 1),
  });

  // ---- Details column ----
  const colX = photoX + photoW + 3 * MM;
  const colW = W - (colX - x) - pad - 17 * MM; // leave room for the QR block
  let cursorY = y + H - headerH - 5.6 * MM;

  const nameSize = fitText(data.name.toUpperCase(), bold, colW + 12 * MM, 10.5, 6);
  page.drawText(data.name.toUpperCase(), {
    x: colX,
    y: cursorY,
    size: nameSize,
    font: bold,
    color: rgb(palette.ink.r, palette.ink.g, palette.ink.b),
  });
  cursorY -= 3.6 * MM;

  const schoolLine = truncate(data.schoolName, 34);
  page.drawText(schoolLine, {
    x: colX,
    y: cursorY,
    size: fitText(schoolLine, regular, colW + 12 * MM, 6.6, 5),
    font: regular,
    color: rgb(palette.soft.r, palette.soft.g, palette.soft.b),
  });
  cursorY -= 4.6 * MM;

  const rows: [string, string][] = [
    ['ID', data.code],
    ['CATEGORY', `${AGE_CATEGORY_SHORT[data.ageCategory as AgeCategory] ?? data.ageCategory} · ${data.gender === 'MALE' ? 'M' : 'F'}`],
    ['WEIGHT / BELT', `${data.weightKg} kg · ${truncate(data.beltGrade, 14)}`],
    ['EVENT(S)', data.events.length ? data.events.join(' + ') : '—'],
  ];

  for (const [label, value] of rows) {
    page.drawText(label, {
      x: colX,
      y: cursorY,
      size: 4.6,
      font: bold,
      color: rgb(palette.muted.r, palette.muted.g, palette.muted.b),
    });
    page.drawText(value, {
      x: colX,
      y: cursorY - 2.5 * MM,
      size: fitText(value, regular, colW + 12 * MM, 7, 4.5),
      font: regular,
      color: rgb(palette.ink.r, palette.ink.g, palette.ink.b),
    });
    cursorY -= 5.6 * MM;
  }

  // ---- QR block (weigh-in / bout check-in / venue access) ----
  const qrSize = 15.5 * MM;
  const qrX = x + W - pad - qrSize;
  const qrY = y + 5.2 * MM;
  const qrBytes = await qrPng(`${event.baseUrl}/p/${data.code}`);
  const qrImage = await doc.embedPng(qrBytes);
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });

  const scanLabel = 'SCAN TO CHECK IN';
  page.drawText(scanLabel, {
    x: qrX + qrSize / 2 - regular.widthOfTextAtSize(scanLabel, 4.2) / 2,
    y: qrY - 2.2 * MM,
    size: 4.2,
    font: regular,
    color: rgb(palette.muted.r, palette.muted.g, palette.muted.b),
  });

  // ---- Footer ----
  page.drawText(`${data.schoolCode} · rev ${data.version}`, {
    x: x + pad,
    y: y + 2.1 * MM,
    size: 4.4,
    font: regular,
    color: rgb(palette.muted.r, palette.muted.g, palette.muted.b),
  });
}

/** One card, one page, exact ID-1 size — for professional card printing. */
export async function buildSingleCardPdf(data: CardData, event: CardEvent): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Accreditation — ${data.name} (${data.code})`);
  doc.setAuthor(event.eventName);
  doc.setSubject('Accreditation card');

  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const page = doc.addPage([CARD.width, CARD.height]);
  await drawCard(doc, page, 0, 0, data, event, fonts);

  return doc.save();
}

/** Batch sheet: 2 × 5 cards per A4 with crop marks, for in-house printing. */
export async function buildBatchCardPdf(cards: CardData[], event: CardEvent): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Accreditation batch — ${cards.length} card(s)`);
  doc.setAuthor(event.eventName);

  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const cols = 2;
  const rows = 5;
  const perPage = cols * rows;
  const gapX = 6 * MM;
  const gapY = 2.4 * MM;
  const gridW = cols * CARD.width + (cols - 1) * gapX;
  const gridH = rows * CARD.height + (rows - 1) * gapY;
  const originX = (A4.width - gridW) / 2;
  const originY = (A4.height - gridH) / 2;

  if (!cards.length) {
    const page = doc.addPage([A4.width, A4.height]);
    page.drawText('No approved participants to print yet.', {
      x: 60,
      y: A4.height / 2,
      size: 12,
      font: fonts.regular,
      color: rgb(palette.soft.r, palette.soft.g, palette.soft.b),
    });
    return doc.save();
  }

  for (let i = 0; i < cards.length; i++) {
    const slot = i % perPage;
    const page =
      slot === 0 ? doc.addPage([A4.width, A4.height]) : doc.getPage(doc.getPageCount() - 1);

    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const x = originX + col * (CARD.width + gapX);
    const y = originY + gridH - (row + 1) * CARD.height - row * gapY;

    await drawCard(doc, page, x, y, cards[i]!, event, fonts);

    // Crop marks
    const mark = 3;
    const c = rgb(palette.muted.r, palette.muted.g, palette.muted.b);
    for (const [mx, my] of [
      [x, y],
      [x + CARD.width, y],
      [x, y + CARD.height],
      [x + CARD.width, y + CARD.height],
    ] as [number, number][]) {
      page.drawLine({ start: { x: mx - mark, y: my }, end: { x: mx + mark, y: my }, thickness: 0.25, color: c });
      page.drawLine({ start: { x: mx, y: my - mark }, end: { x: mx, y: my + mark }, thickness: 0.25, color: c });
    }

    if (slot === perPage - 1 || i === cards.length - 1) {
      const footer = `${event.eventName} ${event.edition} — accreditation batch sheet, page ${doc.getPageCount()}`;
      page.drawText(footer, {
        x: originX,
        y: 12 * MM,
        size: 7,
        font: fonts.regular,
        color: rgb(palette.muted.r, palette.muted.g, palette.muted.b),
      });
    }
  }

  return doc.save();
}
