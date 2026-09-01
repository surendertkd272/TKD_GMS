'use client';

import { useRef, useState } from 'react';

const MAX_EDGE = 640; // a card photo box is ~20mm wide; 640px is generous
const QUALITY = 0.85;

/**
 * Downscales the chosen photo before it is submitted.
 *
 * Coaches upload straight from a phone, so the original is several megabytes
 * for a passport-sized box on an accreditation card. Resizing here keeps the
 * stored row to tens of kilobytes and the upload quick on a venue's wifi. The
 * server still enforces its own ceiling — this is a convenience, not the guard.
 */
export function PhotoField({ id = 'photo', name = 'photo' }: { id?: string; name?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !inputRef.current) return;

    // Anything already small enough goes through untouched.
    if (file.size <= 200 * 1024) {
      setStatus(null);
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);

      const context = canvas.getContext('2d');
      if (!context) return;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', QUALITY),
      );
      if (!blob || blob.size >= file.size) return; // no gain; keep the original

      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
        type: 'image/jpeg',
        lastModified: Date.now(),
      }));
      inputRef.current.files = transfer.files;

      setStatus(`Resized to ${Math.round(blob.size / 1024)} KB for the accreditation card.`);
    } catch {
      // Older browser, or an image the canvas cannot decode — send the original
      // and let the server decide.
      setStatus(null);
    }
  }

  return (
    <div className="min-w-0">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept="image/jpeg,image/png"
        onChange={onChange}
        className="input file:mr-3 file:rounded file:border-0 file:bg-surface-sunk file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-ink-soft"
      />
      {status && <p className="mt-1.5 text-xs text-ink-muted">{status}</p>}
    </div>
  );
}
