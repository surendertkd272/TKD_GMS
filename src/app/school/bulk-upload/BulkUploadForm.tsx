'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { bulkUploadParticipants, type BulkUploadState } from '@/actions/school';
import { SubmitButton } from '@/components/SubmitButton';
import { Card, Field, Notice, Stat, TableWrap } from '@/components/ui';

const ROW_BADGE: Record<string, string> = {
  CREATED: 'badge-green',
  SKIPPED: 'badge-amber',
  ERROR: 'badge-red',
};

export function BulkUploadForm() {
  const [state, action] = useActionState<BulkUploadState, FormData>(bulkUploadParticipants, null);

  return (
    <div className="space-y-6">
      <Card title="Upload file">
        <form action={action} className="space-y-4">
          {state?.error && <Notice kind="error">{state.error}</Notice>}

          <Field
            label="CSV file"
            name="csv"
            required
            hint="Max 2 MB. The first row must be the header row. Rows that fail validation are reported and skipped — valid rows still save."
          >
            <input
              id="csv"
              name="csv"
              type="file"
              accept=".csv,text/csv"
              required
              className="input file:mr-3 file:rounded file:border-0 file:bg-surface-sunk file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-ink-soft"
            />
          </Field>

          <SubmitButton className="btn-primary" pendingLabel="Validating and importing…">
            Upload and import
          </SubmitButton>
        </form>
      </Card>

      {state?.summary && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Rows read" value={state.summary.total} />
            <Stat label="Created" value={state.summary.created} />
            <Stat label="Skipped" value={state.summary.skipped} hint="Already entered" />
            <Stat label="Failed" value={state.summary.failed} hint="Needs a fix" />
          </div>

          {state.summary.created > 0 && (
            <Notice kind="ok">
              {state.summary.created} participant{state.summary.created === 1 ? '' : 's'} imported.{' '}
              <Link href="/school/participants" className="font-medium underline">
                Review the squad
              </Link>{' '}
              and add photos.
            </Notice>
          )}

          <Card title="Row-by-row result" bodyClassName="">
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Name</th>
                    <th>Result</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows?.map((row) => (
                    <tr key={`${row.row}-${row.name}`}>
                      <td className="num">{row.row}</td>
                      <td className="font-medium text-ink">{row.name}</td>
                      <td>
                        <span className={ROW_BADGE[row.status]}>{row.status.toLowerCase()}</span>
                      </td>
                      <td>{row.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        </>
      )}
    </div>
  );
}
