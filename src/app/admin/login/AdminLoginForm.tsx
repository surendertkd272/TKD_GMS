'use client';

import { useActionState } from 'react';
import { adminLoginAction, type AuthState } from '@/actions/auth';
import { SubmitButton } from '@/components/SubmitButton';
import { Field, Notice } from '@/components/ui';

export function AdminLoginForm({ initialError }: { initialError?: string }) {
  const [state, action] = useActionState<AuthState, FormData>(
    adminLoginAction,
    initialError ? { error: initialError } : null,
  );

  return (
    <form action={action} className="space-y-4">
      {state?.error && <Notice kind="error">{state.error}</Notice>}

      <Field label="Email" name="email" required>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="input"
          placeholder="admin@taekwondogms.org"
        />
      </Field>

      <Field label="Password" name="password" required>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
          placeholder="••••••••"
        />
      </Field>

      <SubmitButton className="btn-primary w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
