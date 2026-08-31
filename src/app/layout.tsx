import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Taekwondo GMS',
    template: '%s · Taekwondo GMS',
  },
  description:
    'Registration, accreditation, live draws, scoring, medal tally and digital certificates for taekwondo championships.',
};

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
