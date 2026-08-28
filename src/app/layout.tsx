import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getSettings } from '@/lib/db';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return {
    title: {
      default: `${settings.eventName} ${settings.edition}`,
      template: `%s · ${settings.eventName}`,
    },
    description:
      'Registration, accreditation, live draws, scoring, medal tally and digital certificates for the championship.',
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#c8102e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
