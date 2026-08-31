import type { ReactNode } from 'react';
import Link from 'next/link';
import { Brand } from './Brand';
import { NavLink } from './NavLink';
import { logoutAction } from '@/actions/auth';
import { ROLE_LABEL, type Role } from '@/lib/constants';

export type NavItem = { href: string; label: string; exact?: boolean; badge?: number };
export type NavSection = { title?: string; items: NavItem[] };

export function AppShell({
  eventName,
  edition,
  role,
  userName,
  contextLine,
  sections,
  children,
}: {
  eventName: string;
  edition: string;
  role: Role;
  userName: string;
  contextLine?: string;
  sections: NavSection[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface-sunk">
      {/* Mobile bar */}
      <div className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-surface-line bg-white px-4 py-3 lg:hidden">
        <Brand eventName={eventName} edition={edition} href="/" compact />
        <form action={logoutAction}>
          <button className="btn-quiet btn-sm" type="submit">
            Sign out
          </button>
        </form>
      </div>

      <div className="lg:flex">
        <aside className="no-print hidden w-64 shrink-0 border-r border-surface-line bg-white lg:flex lg:h-screen lg:flex-col lg:sticky lg:top-0">
          <div className="border-b border-surface-line px-4 py-4">
            <Brand eventName={eventName} edition={edition} href="/" compact />
          </div>

          <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
            {sections.map((section, idx) => (
              <div key={section.title ?? idx}>
                {section.title && (
                  <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                    {section.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavLink key={item.href} href={item.href} exact={item.exact}>
                      <span className="flex-1">{item.label}</span>
                      {item.badge ? (
                        <span className="rounded-full bg-tkd-red px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {item.badge}
                        </span>
                      ) : null}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-surface-line px-4 py-3.5">
            <p className="truncate text-sm font-medium text-ink">{userName}</p>
            <p className="truncate text-xs text-ink-muted">{contextLine ?? ROLE_LABEL[role]}</p>
            <div className="mt-2.5 flex items-center gap-2">
              <form action={logoutAction} className="flex-1">
                <button className="btn-ghost btn-sm w-full" type="submit">
                  Sign out
                </button>
              </form>
              <Link href="/" className="btn-quiet btn-sm" title="Public page">
                Public
              </Link>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {/* Mobile nav strip */}
          <div className="no-print flex gap-1 overflow-x-auto border-b border-surface-line bg-white px-3 py-2 lg:hidden">
            {sections.flatMap((s) => s.items).map((item) => (
              <NavLink key={item.href} href={item.href} exact={item.exact}>
                <span className="whitespace-nowrap text-xs">{item.label}</span>
              </NavLink>
            ))}
          </div>

          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
