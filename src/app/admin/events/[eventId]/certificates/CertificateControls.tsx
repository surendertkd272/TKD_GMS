'use client';

import { useActionState } from 'react';
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
  const [sendState, sendAction] = useActionState<AdminState, FormData>(dispatchCertificatesAction, null);

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
        <form action={sendAction} className="space-y-4">
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

          <SubmitButton
            className="btn-primary w-full"
            pendingLabel="Sending…"
            confirm="Send certificate emails now?"
          >
            Send certificate emails
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
