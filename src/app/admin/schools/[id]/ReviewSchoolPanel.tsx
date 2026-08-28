'use client';

import { useActionState, useState } from 'react';
import { reviewSchool, type AdminState } from '@/actions/admin';
import { SubmitButton } from '@/components/SubmitButton';
import { FormMessage } from '@/components/FormMessage';
import { Field } from '@/components/ui';

export function ReviewSchoolPanel({
  schoolId,
  status,
  participantCount,
}: {
  schoolId: string;
  status: string;
  participantCount: number;
}) {
  const [state, action] = useActionState<AdminState, FormData>(reviewSchool, null);
  const [showReject, setShowReject] = useState(false);

  return (
    <div className="space-y-4">
      <FormMessage state={state} />

      {status === 'APPROVED' ? (
        <p className="text-sm leading-relaxed text-ink-soft">
          Approved. All {participantCount} accreditation card{participantCount === 1 ? '' : 's'} are
          released to the school.
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-ink-soft">
          Approving releases {participantCount} accreditation card{participantCount === 1 ? '' : 's'} and
          marks every pending participant as accredited.
        </p>
      )}

      {!showReject ? (
        <div className="space-y-2">
          {status !== 'APPROVED' && (
            <form action={action}>
              <input type="hidden" name="schoolId" value={schoolId} />
              <input type="hidden" name="decision" value="APPROVE" />
              <SubmitButton
                className="btn-primary w-full"
                pendingLabel="Approving…"
                confirm={`Approve this school and release ${participantCount} accreditation card(s)?`}
              >
                Approve registration
              </SubmitButton>
            </form>
          )}
          <button type="button" onClick={() => setShowReject(true)} className="btn-ghost w-full">
            Return to school with a note
          </button>
        </div>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="decision" value="REJECT" />

          <Field label="What needs fixing?" name="reason" required>
            <textarea
              id="reason"
              name="reason"
              required
              className="textarea"
              placeholder="e.g. Three athletes have no date of birth on file; two photos are unusable."
            />
          </Field>

          <div className="flex gap-2">
            <SubmitButton className="btn-danger flex-1" pendingLabel="Sending…">
              Return registration
            </SubmitButton>
            <button type="button" onClick={() => setShowReject(false)} className="btn-quiet">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
