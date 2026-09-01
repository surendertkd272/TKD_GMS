'use client';

import { useActionState, useState } from 'react';
import { dispatchCertificatesAction, issueCertificatesAction, type AdminState } from '@/actions/admin';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Card, Field, TableWrap } from '@/components/ui';
import { EventIdField } from '@/components/EventIdField';

export function CertificateControls({
  categories,
  schools,
}: {
  categories: { id: string; name: string; results: number; certificates: number }[];
  schools: { id: string; name: string; code: string; contactEmail: string }[];
}) {
  const [issueState, issueAction] = useActionState<AdminState, FormData>(issueCertificatesAction, null);
  // Dispatch sends a few schools per call so it fits inside a serverless
  // function's budget. Keep calling it until nothing is left, rather than
  // making the organiser press the button once per batch.
  const [sending, setSending] = useState(false);
  const [sendState, setSendState] = useState<AdminState>(null);
  const [progress, setProgress] = useState<{ sent: number; rounds: number } | null>(null);

  async function sendAll(formData: FormData) {
    setSending(true);
    setSendState(null);
    setProgress(null);

    let sent = 0;
    let rounds = 0;
    const warnings: string[] = [];

    try {
      for (;;) {
        const result = await dispatchCertificatesAction(null, formData);
        rounds++;

        if (result?.error) {
          setSendState({ error: result.error });
          return;
        }
        sent += result?.sent ?? 0;
        if (result?.warnings?.length) warnings.push(...result.warnings);
        setProgress({ sent, rounds });

        if (!result?.remaining) {
          setSendState({
            ok: true,
            message:
              sent === 0
                ? 'Nothing to send — every certificate in that selection has already been emailed.'
                : `Sent ${sent} certificate${sent === 1 ? '' : 's'} across ${rounds} batch${rounds === 1 ? '' : 'es'}.`,
            warnings: warnings.length ? warnings : undefined,
          });
          return;
        }

        // Re-sending is a one-off instruction; continuing must not repeat it.
        formData.delete('resend');
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Generate" subtitle="Idempotent — running it twice will not duplicate a certificate.">
        <form action={issueAction} className="space-y-4">
          <EventIdField />
          <FormMessage state={issueState} />

          <Field label="Scope" name="categoryId">
            <select id="categoryId" name="categoryId" className="select" defaultValue="ALL">
              <option value="ALL">Every finalised category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} — {category.results} result(s), {category.certificates} issued
                </option>
              ))}
            </select>
          </Field>

          <SubmitButton className="btn-dark w-full" pendingLabel="Issuing…">
            Issue certificates
          </SubmitButton>
        </form>

        {categories.length > 0 && (
          <div className="mt-5 border-t border-surface-line pt-4">
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Finalised category</th>
                    <th>Results</th>
                    <th>Certificates</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.slice(0, 8).map((category) => (
                    <tr key={category.id}>
                      <td className="text-xs text-ink">{category.name}</td>
                      <td className="num">{category.results}</td>
                      <td className="num">
                        {category.certificates === 0 ? (
                          <span className="badge-amber">none</span>
                        ) : (
                          category.certificates
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        )}
      </Card>

      <Card
        title="Email to schools"
        subtitle="One email per school with every outstanding certificate attached as a single PDF."
      >
        <form action={sendAll} className="space-y-4">
          <EventIdField />
          <FormMessage state={sendState} />

          <Field label="School" name="schoolId" hint="Leave blank to send to every school with unsent certificates.">
            <select id="schoolId" name="schoolId" className="select" defaultValue="">
              <option value="">All schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.code} — {school.name} ({school.contactEmail})
                </option>
              ))}
            </select>
          </Field>

          <label className="flex items-start gap-2.5 text-sm text-ink-soft">
            <input type="checkbox" name="resend" className="checkbox mt-0.5" />
            <span>
              Re-send certificates that were already emailed
              <span className="block text-xs text-ink-muted">
                Use this only when a school reports it never arrived.
              </span>
            </span>
          </label>

          {progress && sending && (
            <p className="text-sm text-ink-soft" aria-live="polite">
              Sending… {progress.sent} certificate{progress.sent === 1 ? '' : 's'} so far, batch{' '}
              {progress.rounds}.
            </p>
          )}

          <SubmitButton
            className="btn-primary w-full"
            pendingLabel="Sending…"
            confirm="Send certificate emails now?"
            disabled={sending}
          >
            {sending ? 'Sending…' : 'Send certificate emails'}
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
