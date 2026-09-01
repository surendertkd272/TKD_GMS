import 'server-only';
import QRCode from 'qrcode';
import type { PDFDocument, PDFImage } from 'pdf-lib';
import { readPhoto } from '../photo-storage';

export const MM = 2.834645669; // 1 mm in PDF points
export const A4 = { width: 595.28, height: 841.89 };
export const A4_LANDSCAPE = { width: 841.89, height: 595.28 };
export const CARD = { width: 85.6 * MM, height: 54 * MM }; // ISO/IEC 7810 ID-1

export const palette = {
  red: rgbHex('#c8102e'),
  ink: rgbHex('#12171d'),
  soft: rgbHex('#4a5561'),
  muted: rgbHex('#8b95a1'),
  line: rgbHex('#d8dde3'),
  wash: rgbHex('#f4f6f8'),
  white: rgbHex('#ffffff'),
  gold: rgbHex('#b8912a'),
  silver: rgbHex('#8b95a1'),
  bronze: rgbHex('#a1662f'),
  blue: rgbHex('#0b3d91'),
};

function rgbHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

export async function qrPng(data: string, size = 320): Promise<Buffer> {
  return QRCode.toBuffer(data, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 0,
    width: size,
    color: { dark: '#12171dff', light: '#ffffffff' },
  });
}

/** Embeds an uploaded participant photo; returns null when absent/unreadable. */
export async function embedPhoto(doc: PDFDocument, photoPath: string | null | undefined): Promise<PDFImage | null> {
  if (!photoPath) return null;
  try {
    // Cards render on the server, so they read the bucket directly rather than
    // going back through the authenticated photo route.
    const photo = await readPhoto(photoPath);
    if (!photo) return null;
    return photo.contentType === 'image/png'
      ? await doc.embedPng(photo.bytes)
      : await doc.embedJpg(photo.bytes);
  } catch {
    return null;
  }
}

/** Shrinks text until it fits `maxWidth`, never below `minSize`. */
export function fitText(
  text: string,
  font: { widthOfTextAtSize(t: string, s: number): number },
  maxWidth: number,
  startSize: number,
  minSize = 5,
): number {
  let size = startSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.25;
  return size;
}

/** Greedy word wrap. */
export function wrapText(
  text: string,
  font: { widthOfTextAtSize(t: string, s: number): number },
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export const truncate = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
