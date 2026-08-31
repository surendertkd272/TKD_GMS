import type { ReactNode } from 'react';
import Link from 'next/link';
import { Brand } from './Brand';
import { NavLink } from './NavLink';
import { logoutAction } from '@/actions/auth';
import { ROLE_LABEL, type Role } from '@/lib/constants';

export type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  badge?: number;
  /**
   * A link out of this section rather than a page within it. Rendered plain, so
   * it never picks up the active state — "/admin/events" is a prefix of every
   * admin URL, which otherwise left two items looking selected at once.
   */
  back?: boolean;
};
export type NavSection = { title?: string; items: NavItem[] };

export function AppShell({
  eventName,
  edition,
  eventSlug,
  homeHref,
  publicHref,
  role,
  userName,
  contextLine,
  sections,
  children,
}: {
  eventName: string;
  edition: string;
  /** Present for event-scoped shells (school/referee); admin shells pass hrefs directly. */
  eventSlug?: string;
  homeHref?: string;
  publicHref?: string;
  role: Role;
  userName: string;
  contextLine?: string;
  sections: NavSection[];
  children: ReactNode;
}) {
  const brandHref = homeHref ?? (eventSlug ? `/events/${eventSlug}` : '/');
  const publicLink = publicHref ?? (eventSlug ? `/events/${eventSlug}` : '/');
  return (
    <div className="min-h-screen bg-surface-sunk">
      {/* Mobile bar */}
      <div className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-surface-line bg-white px-4 py-3 lg:hidden">
        <Brand eventName={eventName} edition={edition} href={brandHref} compact />
        <form action={logoutAction}>
          <button className="btn-quiet btn-sm" type="submit">
            Sign out
          </button>
        </form>
      </div>

      <div className="lg:flex">
        <aside className="no-print hidden w-64 shrink-0 border-r border-surface-line bg-white lg:flex lg:h-screen lg:flex-col lg:sticky lg:top-0">
          <div className="border-b border-surface-line px-4 py-4">
            <Brand eventName={eventName} edition={edition} href={brandHref} compact />
          </div>

          <nav className="scroll-shadow flex-1 space-y-5 overflow-y-auto px-3 py-4">
            {sections.map((section, idx) => (
              <div key={section.title ?? idx}>
                {section.title && (
                  <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                    {section.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) =>
                    item.back ? (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="nav-link text-ink-muted hover:text-ink"
                      >
                        <span className="flex-1">{item.label}</span>
                      </Link>
                    ) : (
                      <NavLink key={item.href} href={item.href} exact={item.exact}>
                        <span className="flex-1">{item.label}</span>
                        {item.badge ? (
                          <span className="rounded-full bg-tkd-red px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {item.badge}
                          </span>
                        ) : null}
                      </NavLink>
                    ),
                  )}
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
              <Link href={publicLink} className="btn-quiet btn-sm" title="Public page">
                Public
              </Link>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {/* Mobile nav strip */}
          <div className="no-print flex gap-1 overflow-x-auto border-b border-surface-line bg-white px-3 py-2 lg:hidden">
            {sections.flatMap((s) => s.items).filter((item) => !item.back).map((item) => (
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
