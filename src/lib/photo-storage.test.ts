import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { PhotoStorageError, deletePhoto, putPhoto, readPhoto, usingObjectStorage } from './photo-storage';

/**
 * Exercises the object-storage branch against a stub that speaks the Supabase
 * Storage REST contract, so the request shape, auth header and failure handling
 * are covered without needing a live bucket.
 */

type Hit = { method: string; url: string; auth: string | undefined; contentType: string | undefined; body: Buffer };

let server: Server;
let baseUrl = '';
let hits: Hit[] = [];
const stored = new Map<string, Buffer>();
let failNext: number | null = null;

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000200000002080600000072b60d24000000164944415478da63fccfc0f09f8112a8c1f4a30d008d6f0691b7f0b1b90000000049454e44ae426082',
  'hex',
);
const file = (bytes: Buffer, type = 'image/png') =>
  new File([new Uint8Array(bytes)], 'p.png', { type });

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      hits.push({
        method: req.method!,
        url: req.url!,
        auth: req.headers.authorization,
        contentType: req.headers['content-type'],
        body,
      });

      if (failNext !== null) {
        const status = failNext;
        failNext = null;
        res.writeHead(status).end('bucket not found');
        return;
      }
      if (req.method === 'POST') {
        stored.set(req.url!, body);
        res.writeHead(200).end('{}');
      } else if (req.method === 'GET') {
        const found = stored.get(req.url!);
        if (!found) res.writeHead(404).end();
        else res.writeHead(200).end(found);
      } else if (req.method === 'DELETE') {
        stored.delete(req.url!);
        res.writeHead(200).end('{}');
      } else {
        res.writeHead(405).end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  process.env.SUPABASE_URL = baseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  process.env.SUPABASE_PHOTO_BUCKET = 'participant-photos';
});

afterAll(async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_PHOTO_BUCKET;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  hits = [];
  stored.clear();
  failNext = null;
});

describe('photo storage — object storage branch', () => {
  it('is active once a url and key are configured', () => {
    expect(usingObjectStorage()).toBe(true);
  });

  it('uploads to the bucket path with the service key and upsert', async () => {
    const stored_path = await putPhoto('abc123', file(PNG));

    expect(stored_path).toBe('participants/abc123.png');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      method: 'POST',
      url: '/storage/v1/object/participant-photos/participants/abc123.png',
      auth: 'Bearer test-service-key',
      contentType: 'image/png',
    });
    expect(hits[0]!.body.equals(PNG)).toBe(true);
  });

  it('names JPEG uploads with a jpg extension', async () => {
    expect(await putPhoto('abc123', file(PNG, 'image/jpeg'))).toBe('participants/abc123.jpg');
  });

  it('reads the bytes back with the right content type', async () => {
    const path = await putPhoto('abc123', file(PNG));
    const photo = await readPhoto(path);

    expect(photo?.contentType).toBe('image/png');
    expect(photo?.bytes.equals(PNG)).toBe(true);
  });

  it('returns null rather than throwing when an object is missing', async () => {
    expect(await readPhoto('participants/never-uploaded.png')).toBeNull();
  });

  it('deletes through the same path', async () => {
    const path = await putPhoto('abc123', file(PNG));
    await deletePhoto(path);

    expect(hits.at(-1)).toMatchObject({ method: 'DELETE', auth: 'Bearer test-service-key' });
    expect(await readPhoto(path)).toBeNull();
  });

  // The whole point of the rewrite: a failed upload must be visible.
  it('throws with the status when the bucket rejects the upload', async () => {
    failNext = 404;
    await expect(putPhoto('abc123', file(PNG))).rejects.toThrow(PhotoStorageError);
    failNext = 404;
    await expect(putPhoto('abc123', file(PNG))).rejects.toThrow(/404/);
  });

  it('rejects an oversized file before making a request', async () => {
    const big = Buffer.alloc(3 * 1024 * 1024 + 1);
    await expect(putPhoto('abc123', file(big))).rejects.toThrow(/under 3 MB/);
    expect(hits).toHaveLength(0);
  });

  it('rejects a file that is not a JPG or PNG', async () => {
    await expect(putPhoto('abc123', file(PNG, 'image/gif'))).rejects.toThrow(/JPG or PNG/);
    expect(hits).toHaveLength(0);
  });

  it('rejects an empty file', async () => {
    await expect(putPhoto('abc123', file(Buffer.alloc(0)))).rejects.toThrow(/empty/);
  });
});
