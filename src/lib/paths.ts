/**
 * Single source of truth for every internal URL.
 *
 * Routes are event-scoped now, and path strings are NOT type-checked when
 * inlined into `Link href` / `redirect()` / `revalidatePath()` — a stale literal
 * fails silently as a 404 or a stale cache rather than a build error. Everything
 * routes through here so a future move is a one-file change.
 */

/** Public directory of events. */
export const HOME = '/';

/** Super Admin login (platform-level, not tied to an event). */
export const ADMIN_LOGIN = '/admin/login';

/** Super Admin's event list — their landing page after login. */
export const ADMIN_EVENTS = '/admin/events';

export const ADMIN_EVENT_NEW = '/admin/events/new';

/** Super Admin's own account (password change). */
export const ADMIN_ACCOUNT = '/admin/account';

/** Admin pages for one event: adminPath(id), adminPath(id, 'draws'), … */
export function adminPath(eventId: string, sub = ''): string {
  return sub ? `/admin/events/${eventId}/${sub}` : `/admin/events/${eventId}`;
}

/** Public event pages: eventPath(slug), eventPath(slug, 'results'), … */
export function eventPath(slug: string, sub = ''): string {
  return sub ? `/events/${slug}/${sub}` : `/events/${slug}`;
}

/** School portal within an event. */
export function schoolPath(slug: string, sub = ''): string {
  return sub ? `/events/${slug}/school/${sub}` : `/events/${slug}/school`;
}

/** Referee / mat-side portal within an event. */
export function matPath(slug: string, sub = ''): string {
  return sub ? `/events/${slug}/mat/${sub}` : `/events/${slug}/mat`;
}

/** School + referee login for one event. */
export function eventLoginPath(slug: string): string {
  return eventPath(slug, 'login');
}

export function registerSchoolPath(slug: string): string {
  return eventPath(slug, 'register-school');
}
