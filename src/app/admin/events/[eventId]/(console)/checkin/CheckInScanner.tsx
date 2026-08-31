'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Pulls the participant code out of either a raw code or a scanned profile URL. */
function extractCode(raw: string): string {
  const trimmed = raw.trim();
  const tail = trimmed.split('/').filter(Boolean).pop() ?? trimmed;
  return tail.toUpperCase();
}

export function CheckInScanner({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const [manual, setManual] = useState(initialCode ?? '');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window);
  }, []);

  useEffect(() => {
    if (!scanning) return;

    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // @ts-expect-error BarcodeDetector is not yet in lib.dom.d.ts
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              const value = extractCode(codes[0].rawValue ?? '');
              if (value) {
                stop();
                router.push(`/admin/checkin?code=${encodeURIComponent(value)}`);
                return;
              }
            }
          } catch {
            // transient decode failure — keep scanning
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        setScanError('Camera access was denied or is unavailable on this device.');
        setScanning(false);
      }
    }

    function stop() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    start();
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const code = extractCode(manual);
          if (code) router.push(`/admin/checkin?code=${encodeURIComponent(code)}`);
        }}
      >
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Participant ID, e.g. TKD26-0042"
          className="input flex-1 min-w-[220px]"
          autoFocus
        />
        <button type="submit" className="btn-dark">
          Look up
        </button>
        {supported && (
          <button type="button" className="btn-ghost" onClick={() => setScanning((s) => !s)}>
            {scanning ? 'Stop camera' : 'Scan QR'}
          </button>
        )}
      </form>

      {!supported && (
        <p className="text-xs text-ink-muted">
          QR scanning needs a Chromium-based browser (Chrome/Edge on Android or desktop). Enter the code by hand
          instead.
        </p>
      )}

      {scanError && <p className="text-xs text-tkd-red">{scanError}</p>}

      {scanning && (
        <div className="overflow-hidden rounded-lg border border-surface-line bg-black">
          <video ref={videoRef} className="aspect-video w-full max-w-sm object-cover" muted playsInline />
        </div>
      )}
    </div>
  );
}
