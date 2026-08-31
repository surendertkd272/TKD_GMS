import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { NewEventForm } from './NewEventForm';
import { ADMIN_EVENTS } from '@/lib/paths';

export const metadata = { title: 'Create event' };

export default async function NewEventPage() {
  await requireAdmin();
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-surface-sunk">
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader
          title="Create event"
          subtitle="Sets up a fresh championship. The URL, the participant-ID prefix and the full WT division grid are generated for you."
          actions={
            <Link href={ADMIN_EVENTS} className="btn-quiet">
              Cancel
            </Link>
          }
        />
        <NewEventForm defaultEdition={String(year)} />
      </main>
    </div>
  );
}
