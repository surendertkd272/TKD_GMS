import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db, getEventById } from '@/lib/db';
import { Card, Empty, Notice, PageHeader, Stat, TableWrap } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { mailModeLabel } from '@/lib/mail';
import { smsModeLabel } from '@/lib/sms';

export const metadata = { title: 'Outbox' };
export const dynamic = 'force-dynamic';

const CHANNEL_LABEL: Record<string, string> = { EMAIL: 'Email', SMS: 'SMS', WHATSAPP: 'WhatsApp' };

export default async function AdminOutboxPage({ params }: { params: Promise<{ eventId: string }> }) {
  await requireAdmin();
  const { eventId } = await params;
  const event = await getEventById(eventId);
  if (!event) notFound();

  const [messages, delivered, recorded] = await Promise.all([
    db.outboxMessage.findMany({ where: { eventId }, orderBy: { createdAt: 'desc' }, take: 200 }),
    db.outboxMessage.count({ where: { eventId, delivered: true } }),
    db.outboxMessage.count({ where: { eventId, delivered: false } }),
  ]);

  return (
    <>
      <PageHeader
        title="Outbox"
        subtitle="Every message the system tried to send — certificates, approvals, check-in pings."
      />

      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Delivered" value={delivered} hint="Handed to a transport" />
          <Stat label="Recorded only" value={recorded} hint="No transport configured" />
          <Stat label="Total" value={messages.length} hint="Most recent 200" />
        </div>

        {recorded > 0 && (
          <Notice kind="warn">
            <strong>{recorded} message{recorded === 1 ? '' : 's'} could not be delivered.</strong>{' '}
            Email is {mailModeLabel().toLowerCase()}; SMS is {smsModeLabel().toLowerCase()}. The
            content is kept here so nothing is lost, and schools can still download their
            certificates from their own dashboard. Set SMTP and Twilio credentials to send for real.
          </Notice>
        )}

        {messages.length === 0 ? (
          <Empty
            title="Nothing sent yet"
            hint="Approvals, check-in confirmations and certificate emails all appear here."
          />
        ) : (
          <Card bodyClassName="">
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Channel</th>
                    <th>To</th>
                    <th>Subject / message</th>
                    <th>Attachments</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((message) => (
                    <tr key={message.id}>
                      <td className="whitespace-nowrap text-xs">{fmtDateTime(message.createdAt)}</td>
                      <td className="whitespace-nowrap text-xs">
                        {CHANNEL_LABEL[message.channel] ?? message.channel}
                      </td>
                      <td className="text-xs">{message.recipient}</td>
                      <td className="text-xs text-ink">
                        {message.subject ?? message.body.slice(0, 90)}
                      </td>
                      <td className="text-xs text-ink-muted">{message.attachments ?? '—'}</td>
                      <td>
                        {message.delivered ? (
                          <span className="badge-green">Sent</span>
                        ) : (
                          <span className="badge-amber">Recorded</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        )}
      </div>
    </>
  );
}
