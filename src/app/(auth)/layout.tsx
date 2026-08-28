import { getSettings } from '@/lib/db';
import { Brand } from '@/components/Brand';
import { fmtDate } from '@/lib/format';
import Link from 'next/link';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1fr_minmax(420px,520px)]">
      {/* Context panel — reassures a coach that they are in the right place. */}
      <aside className="hidden bg-ink px-12 py-14 lg:flex lg:flex-col lg:justify-between">
        <Brand eventName={settings.eventName} edition={settings.edition} invert />

        <div className="max-w-md">
          <p className="eyebrow text-white/50">{settings.organiser}</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-white">
            {settings.eventName}
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            One platform for registration, accreditation, draws, live scoring, the medal tally and
            certificates — replacing the paperwork end to end.
          </p>

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/10 pt-8">
            {[
              ['Venue', settings.venue],
              ['Event dates', `${fmtDate(settings.startDate)} – ${fmtDate(settings.endDate)}`],
              ['Entries close', fmtDate(settings.registrationClosesAt)],
              ['Age reference', fmtDate(settings.ageReferenceDate)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/40">{label}</dt>
                <dd className="mt-1 text-sm text-white/90">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <Link href="/" className="text-sm text-white/60 transition-colors hover:text-white">
          ← Public event page
        </Link>
      </aside>

      <main className="flex min-h-screen flex-col justify-center bg-white px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Brand eventName={settings.eventName} edition={settings.edition} />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
