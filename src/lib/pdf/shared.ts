import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import type { PDFDocument, PDFImage } from 'pdf-lib';

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
    const rel = photoPath.replace(/^\/+/, '');
    const abs = path.join(process.cwd(), 'public', rel);
    const bytes = await readFile(abs);
    const lower = abs.toLowerCase();
    if (lower.endsWith('.png')) return await doc.embedPng(bytes);
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return await doc.embedJpg(bytes);
    return null;
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
