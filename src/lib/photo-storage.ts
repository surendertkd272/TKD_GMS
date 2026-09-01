import 'server-only';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

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
const LOCAL_DIR = path.join(process.cwd(), 'public', 'uploads', 'photos');

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BUCKET = process.env.SUPABASE_PHOTO_BUCKET || 'participant-photos';

/** True when object storage is configured; otherwise uploads land on local disk. */
export function usingObjectStorage(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
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
  return `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/${BUCKET}/${key}`;
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
    // The local fallback is a development convenience. On a serverless host the
    // write would fail (or vanish on the next cold start), so say so plainly
    // rather than let a coach believe the photo was accepted.
    if (process.env.NODE_ENV === 'production') {
      throw new PhotoStorageError(
        'Photo storage is not configured on this deployment, so the photo was not saved. ' +
          'Ask the organising team to set SUPABASE_SERVICE_ROLE_KEY.',
      );
    }
    await mkdir(LOCAL_DIR, { recursive: true });
    await writeFile(path.join(LOCAL_DIR, `${participantId}.${ext}`), bytes);
    return key;
  }

  const response = await fetch(objectUrl(key), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`,
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

  // Rows written before object storage held a public-folder path.
  const legacy = storedPath.startsWith('/uploads/');
  if (legacy || !usingObjectStorage()) {
    const file = legacy
      ? path.join(process.cwd(), 'public', storedPath.replace(/^\/+/, ''))
      : path.join(LOCAL_DIR, path.basename(storedPath));
    try {
      return { bytes: await readFile(file), contentType: contentTypeFor(file) };
    } catch {
      return null;
    }
  }

  const response = await fetch(objectUrl(storedPath), {
    headers: { Authorization: `Bearer ${SUPABASE_KEY}` },
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

  const legacy = storedPath.startsWith('/uploads/');
  if (legacy || !usingObjectStorage()) {
    const file = legacy
      ? path.join(process.cwd(), 'public', storedPath.replace(/^\/+/, ''))
      : path.join(LOCAL_DIR, path.basename(storedPath));
    await unlink(file).catch(() => {});
    return;
  }

  await fetch(objectUrl(storedPath), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${SUPABASE_KEY}` },
  }).catch(() => {});
}
