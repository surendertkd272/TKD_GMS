import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui';

export const metadata = { title: 'Verify a certificate' };

async function lookup(formData: FormData) {
  'use server';
  const certNo = String(formData.get('certNo') ?? '')
    .trim()
    .toUpperCase();
  if (!certNo) return;
  redirect(`/verify/${encodeURIComponent(certNo)}`);
}

export default function VerifyIndexPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6 lg:px-8">
      <PageHeader
        title="Verify a certificate"
        subtitle="Every certificate carries a unique number and a QR code. Enter the number to check it against the official record."
      />

      <Card>
        <form action={lookup} className="space-y-4">
          <div>
            <label htmlFor="certNo" className="label">
              Certificate number
            </label>
            <input
              id="certNo"
              name="certNo"
              required
              className="input font-mono"
              placeholder="PRS26-W-000123"
              autoComplete="off"
            />
            <p className="hint">Printed at the bottom-left of the certificate, next to the QR code.</p>
          </div>

          <button type="submit" className="btn-primary w-full">
            Verify certificate
          </button>
        </form>
      </Card>
    </div>
  );
}
