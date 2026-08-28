import 'server-only';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { A4_LANDSCAPE, MM, fitText, palette, qrPng } from './shared';
import { AGE_CATEGORY_SHORT, type AgeCategory } from '../constants';

export type CertificateData = {
  certNo: string;
  type: 'PARTICIPATION' | 'WINNER';
  participantName: string;
  schoolName: string;
  categoryName: string | null;
  event: string | null;
  ageCategory: string | null;
  medal: string | null;
  position: number | null;
  score: number | null;
};

export type CertificateEvent = {
  eventName: string;
  edition: string;
  organiser: string;
  venue: string;
  dateLabel: string;
  baseUrl: string;
  signatory1Name: string;
  signatory1Title: string;
  signatory2Name: string;
  signatory2Title: string;
};

const MEDAL_COLOR: Record<string, { r: number; g: number; b: number }> = {
  GOLD: palette.gold,
  SILVER: palette.silver,
  BRONZE: palette.bronze,
};

const ORDINAL = ['', 'First', 'Second', 'Third'];

/** A4 landscape certificate; one page per certificate in the returned document. */
export async function buildCertificatePdf(
  certificates: CertificateData[],
  event: CertificateEvent,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(
    certificates.length === 1
      ? `Certificate — ${certificates[0]!.participantName}`
      : `${event.eventName} — ${certificates.length} certificates`,
  );
  doc.setAuthor(event.organiser);

  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const W = A4_LANDSCAPE.width;
  const H = A4_LANDSCAPE.height;

  for (const cert of certificates) {
    const page = doc.addPage([W, H]);
    const accent = cert.type === 'WINNER' && cert.medal ? MEDAL_COLOR[cert.medal]! : palette.red;

    // ---- Frame ----
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
    page.drawRectangle({
      x: 10 * MM,
      y: 10 * MM,
      width: W - 20 * MM,
      height: H - 20 * MM,
      borderColor: rgb(accent.r, accent.g, accent.b),
      borderWidth: 2.2,
    });
    page.drawRectangle({
      x: 13 * MM,
      y: 13 * MM,
      width: W - 26 * MM,
      height: H - 26 * MM,
      borderColor: rgb(palette.line.r, palette.line.g, palette.line.b),
      borderWidth: 0.7,
    });

    // Accent corner blocks
    for (const [cx, cy] of [
      [10 * MM, 10 * MM],
      [W - 22 * MM, 10 * MM],
      [10 * MM, H - 22 * MM],
      [W - 22 * MM, H - 22 * MM],
    ] as [number, number][]) {
      page.drawRectangle({ x: cx, y: cy, width: 12 * MM, height: 12 * MM, color: rgb(accent.r, accent.g, accent.b), opacity: 0.10 });
    }

    const center = (text: string, font: typeof serif, size: number, y: number, color = palette.ink, opacity = 1) => {
      page.drawText(text, {
        x: W / 2 - font.widthOfTextAtSize(text, size) / 2,
        y,
        size,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity,
      });
    };

    // ---- Header ----
    center(event.organiser.toUpperCase(), sansBold, 9, H - 30 * MM, palette.muted);

    const titleSize = fitText(event.eventName.toUpperCase(), serifBold, W - 60 * MM, 22, 12);
    center(event.eventName.toUpperCase(), serifBold, titleSize, H - 41 * MM, palette.ink);
    center(`${event.edition}  ·  ${event.venue}`, sans, 9, H - 48 * MM, palette.soft);

    page.drawLine({
      start: { x: W / 2 - 30 * MM, y: H - 53 * MM },
      end: { x: W / 2 + 30 * MM, y: H - 53 * MM },
      thickness: 1.2,
      color: rgb(accent.r, accent.g, accent.b),
    });

    // ---- Certificate kind ----
    const kind = cert.type === 'WINNER' ? `CERTIFICATE OF MERIT` : 'CERTIFICATE OF PARTICIPATION';
    center(kind, sansBold, 13, H - 64 * MM, accent);

    // ---- Recipient ----
    center('This is to certify that', serifItalic, 12, H - 78 * MM, palette.soft);

    const nameSize = fitText(cert.participantName, serifBold, W - 70 * MM, 34, 16);
    center(cert.participantName, serifBold, nameSize, H - 93 * MM, palette.ink);
    page.drawLine({
      start: { x: W / 2 - 55 * MM, y: H - 97 * MM },
      end: { x: W / 2 + 55 * MM, y: H - 97 * MM },
      thickness: 0.6,
      color: rgb(palette.line.r, palette.line.g, palette.line.b),
    });

    const schoolLine = `of ${cert.schoolName}`;
    center(schoolLine, serif, fitText(schoolLine, serif, W - 70 * MM, 13, 9), H - 105 * MM, palette.soft);

    // ---- Achievement ----
    const categoryLabel = cert.categoryName ?? 'the championship';
    const ageLabel = cert.ageCategory ? AGE_CATEGORY_SHORT[cert.ageCategory as AgeCategory] ?? cert.ageCategory : null;

    let bodyLine: string;
    if (cert.type === 'WINNER' && cert.position && cert.position <= 3) {
      bodyLine = `secured ${ORDINAL[cert.position]} Position and is awarded the ${cert.medal} Medal in`;
    } else {
      bodyLine = 'participated in';
    }
    center(bodyLine, serifItalic, 12, H - 117 * MM, palette.soft);

    const achievement = ageLabel ? `${categoryLabel}` : categoryLabel;
    center(achievement, serifBold, fitText(achievement, serifBold, W - 70 * MM, 18, 11), H - 128 * MM, palette.ink);

    if (cert.score != null) {
      center(`Final score ${cert.score.toFixed(2)} / 10.00`, sans, 9, H - 135 * MM, palette.muted);
    }

    center(`held at ${event.venue} on ${event.dateLabel}.`, serif, 11, H - 145 * MM, palette.soft);

    // ---- Signature blocks ----
    const sigY = 34 * MM;
    const sigs: [string, string, number][] = [
      [event.signatory1Name, event.signatory1Title, W * 0.28],
      [event.signatory2Name, event.signatory2Title, W * 0.72],
    ];
    for (const [name, title, cx] of sigs) {
      page.drawLine({
        start: { x: cx - 32 * MM, y: sigY },
        end: { x: cx + 32 * MM, y: sigY },
        thickness: 0.7,
        color: rgb(palette.soft.r, palette.soft.g, palette.soft.b),
      });
      page.drawText(name, {
        x: cx - sansBold.widthOfTextAtSize(name, 10) / 2,
        y: sigY - 5.5 * MM,
        size: 10,
        font: sansBold,
        color: rgb(palette.ink.r, palette.ink.g, palette.ink.b),
      });
      page.drawText(title, {
        x: cx - sans.widthOfTextAtSize(title, 8) / 2,
        y: sigY - 9.5 * MM,
        size: 8,
        font: sans,
        color: rgb(palette.muted.r, palette.muted.g, palette.muted.b),
      });
    }

    // ---- Verification QR + certificate number ----
    const qrSize = 20 * MM;
    const qrBytes = await qrPng(`${event.baseUrl}/verify/${cert.certNo}`);
    const qrImage = await doc.embedPng(qrBytes);
    page.drawImage(qrImage, { x: W - 22 * MM - qrSize + 5 * MM, y: 20 * MM, width: qrSize, height: qrSize });

    page.drawText(`Certificate No. ${cert.certNo}`, {
      x: 22 * MM,
      y: 22 * MM,
      size: 7.5,
      font: sans,
      color: rgb(palette.muted.r, palette.muted.g, palette.muted.b),
    });
    page.drawText('Verify at ' + `${event.baseUrl}/verify`, {
      x: 22 * MM,
      y: 18 * MM,
      size: 7.5,
      font: sans,
      color: rgb(palette.muted.r, palette.muted.g, palette.muted.b),
    });
  }

  return doc.save();
}
