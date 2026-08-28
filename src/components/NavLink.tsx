'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function NavLink({ href, children, exact = false }: { href: string; children: ReactNode; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href} className={`nav-link ${active ? 'nav-link-active' : ''}`}>
      {children}
    </Link>
  );
}

export function TopLink({ href, children, exact = false }: { href: string; children: ReactNode; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`relative whitespace-nowrap px-1 py-3.5 text-sm font-medium transition-colors ${
        active ? 'text-ink' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {children}
      {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-tkd-red" />}
    </Link>
  );
}
