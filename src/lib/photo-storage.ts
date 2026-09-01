import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from './db';

/**
 * Where participant photos live.
 *
 * They used to be written to `public/uploads/photos`, which works locally and
 * silently fails on Vercel — that path is inside the read-only deployment
 * bundle, so every upload in production was accepted and discarded. Storage now
 * goes to a Supabase bucket when one is configured, falling back to the local
 * filesystem for development.
 *
 * The bucket is private: nothing in the app renders a photo publicly, and these
 * are photographs of minors. Reads go through /api/photos/[participantId],
 * which checks the session, so no storage URL is ever handed to a browser.
 */

export class PhotoStorageError extends Error {}

const MAX_BYTES = 3 * 1024 * 1024;
/** Post-downscale ceiling. The browser sends ~60 KB; this is a backstop. */
const MAX_STORED_BYTES = 1024 * 1024;

// Read at call time, not import time, so a deployment can be reconfigured
// without a rebuild — and so this module is testable against a stub endpoint.
const supabaseUrl = () => process.env.SUPABASE_URL ?? '';
const supabaseKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const bucket = () => process.env.SUPABASE_PHOTO_BUCKET || 'participant-photos';

/** True when object storage is configured; otherwise uploads land on local disk. */
export function usingObjectStorage(): boolean {
  return Boolean(supabaseUrl() && supabaseKey());
}

/** "participants/<id>.png" -> "<id>" */
function participantIdFrom(storedPath: string): string {
  return path.basename(storedPath).replace(/\.(png|jpe?g)$/i, '');
}

function extensionFor(type: string): 'jpg' | 'png' {
  const t = type.toLowerCase();
  if (t === 'image/png') return 'png';
  if (t === 'image/jpeg' || t === 'image/jpg') return 'jpg';
  throw new PhotoStorageError('Photo must be a JPG or PNG file.');
}

export function contentTypeFor(storedPath: string): string {
  return storedPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
}

function objectUrl(key: string): string {
  return `${supabaseUrl().replace(/\/+$/, '')}/storage/v1/object/${bucket()}/${key}`;
}

/**
 * Stores the upload and returns the value for `Participant.photoPath`.
 * Throws rather than returning null on failure — a silently dropped photo is
 * exactly the bug this replaces.
 */
export async function putPhoto(participantId: string, file: File): Promise<string> {
  if (file.size === 0) throw new PhotoStorageError('That photo file is empty.');
  if (file.size > MAX_BYTES) throw new PhotoStorageError('Photo must be under 3 MB.');

  const ext = extensionFor(file.type);
  const bytes = Buffer.from(await file.arrayBuffer());
  const key = `participants/${participantId}.${ext}`;

  if (!usingObjectStorage()) {
    if (bytes.byteLength > MAX_STORED_BYTES) {
      throw new PhotoStorageError(
        'That photo is too large to store. Please choose a smaller image.',
      );
    }
    await db.participantPhoto.upsert({
      where: { participantId },
      update: { bytes, contentType: file.type },
      create: { participantId, bytes, contentType: file.type },
    });
    return key;
  }

  const response = await fetch(objectUrl(key), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${supabaseKey()}`,
      'Content-Type': file.type,
      'x-upsert': 'true',
      'cache-control': '3600',
    },
    body: new Uint8Array(bytes),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new PhotoStorageError(
      `Photo upload failed (${response.status}). ${detail.slice(0, 200)}`.trim(),
    );
  }

  return key;
}

/** Reads a stored photo back. Handles the legacy `/uploads/photos/...` form. */
export async function readPhoto(
  storedPath: string | null | undefined,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!storedPath) return null;

  // Rows written before this change hold a public-folder path.
  if (storedPath.startsWith('/uploads/')) {
    try {
      const file = path.join(process.cwd(), 'public', storedPath.replace(/^\/+/, ''));
      return { bytes: await readFile(file), contentType: contentTypeFor(file) };
    } catch {
      return null;
    }
  }

  if (!usingObjectStorage()) {
    const row = await db.participantPhoto.findUnique({
      where: { participantId: participantIdFrom(storedPath) },
    });
    return row ? { bytes: Buffer.from(row.bytes), contentType: row.contentType } : null;
  }

  const response = await fetch(objectUrl(storedPath), {
    headers: { Authorization: `Bearer ${supabaseKey()}` },
    cache: 'no-store',
  });
  if (!response.ok) return null;

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: contentTypeFor(storedPath),
  };
}

/** Best-effort removal; a leftover object must never block deleting a participant. */
export async function deletePhoto(storedPath: string | null | undefined): Promise<void> {
  if (!storedPath) return;

  if (storedPath.startsWith('/uploads/')) return; // legacy file; nothing to clean up here

  if (!usingObjectStorage()) {
    // The row also cascades with the participant; this covers replacing a photo.
    await db.participantPhoto
      .delete({ where: { participantId: participantIdFrom(storedPath) } })
      .catch(() => {});
    return;
  }

  await fetch(objectUrl(storedPath), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${supabaseKey()}` },
  }).catch(() => {});
}
