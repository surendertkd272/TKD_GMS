/** Consistent PDF/CSV responses for the download routes. */
export function pdfResponse(bytes: Uint8Array, filename: string, inline = true): Response {
  return new Response(new Uint8Array(bytes) as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const forbidden = (message = 'Not authorised.') =>
  new Response(message, { status: 403, headers: { 'Content-Type': 'text/plain' } });

export const notFound = (message = 'Not found.') =>
  new Response(message, { status: 404, headers: { 'Content-Type': 'text/plain' } });

export const badRequest = (message: string) =>
  new Response(message, { status: 400, headers: { 'Content-Type': 'text/plain' } });
