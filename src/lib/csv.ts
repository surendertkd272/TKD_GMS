/**
 * RFC 4180 CSV reader/writer. Hand-rolled so bulk upload handles quoted commas,
 * escaped quotes and CRLF from Excel exports without pulling in a parser.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Strip a UTF-8 BOM — Excel adds one and it corrupts the first header cell.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop trailing all-empty rows
  while (rows.length && rows[rows.length - 1]!.every((c) => c.trim() === '')) rows.pop();

  return rows;
}

export type CsvTable = { headers: string[]; rows: Record<string, string>[] };

/** Parse to objects keyed by normalised header (lowercase, non-alnum → nothing). */
export function parseCsvTable(text: string): CsvTable {
  const raw = parseCsv(text);
  if (!raw.length) return { headers: [], rows: [] };

  const headers = raw[0]!.map((h) => h.trim());
  const keys = headers.map(normaliseHeader);

  const rows = raw.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    keys.forEach((key, idx) => {
      obj[key] = (cells[idx] ?? '').trim();
    });
    return obj;
  });

  return { headers, rows };
}

export const normaliseHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
}
