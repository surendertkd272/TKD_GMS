'use client';

import { Notice } from './ui';

export type ActionState = { ok?: boolean; error?: string; message?: string; warnings?: string[] } | null;

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;

  return (
    <div className="space-y-2">
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.message && <Notice kind="ok">{state.message}</Notice>}
      {state.warnings?.length ? (
        <Notice kind="warn">
          <ul className="list-inside list-disc space-y-1">
            {state.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
    </div>
  );
}
