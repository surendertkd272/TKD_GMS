'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * Server-action submit button that disables itself while the action is in
 * flight — matters on the mat, where a double-tap must not double-post a result.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = 'btn-primary',
  confirm,
  name,
  value,
  disabled,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  confirm?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      className={className}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? (pendingLabel ?? 'Working…') : children}
    </button>
  );
}
