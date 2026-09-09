'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Client } from '@fas/shared';
import { REPORTS, reportDefinition, reportRequestError, thisMonth } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Shell } from '@/components/Shell';
import { Button, Card, Field, PageHead, SectionHead, Sheet, SheetOption } from '@/ui';
import { Select } from '@/ui/Select';

export default function ReportRequestPage() {
  return (
    <Shell>
      <ReportRequest />
    </Shell>
  );
}

/**
 * Asking for one.
 *
 * The catalogue comes from `@fas/shared`, so this screen cannot offer a
 * report the API does not build, and the refusal it shows is the same function
 * the API refuses with — there is no way for the two to disagree about what a
 * valid request is.
 */
function ReportRequest() {
  const router = useRouter();
  const month = thisMonth();

  const [kind, setKind] = useState(REPORTS[0].kind as string);
  const [from, setFrom] = useState(`${month}-01`);
  const [to, setTo] = useState(`${month}-01`);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const [clientId, setClientId] = useState<string | undefined>();
  const [clientName, setClientName] = useState('');
  const [clientSheet, setClientSheet] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  const definition = reportDefinition(kind);
  const needsPeriod = definition?.period !== 'none';
  const needsClient = definition?.subject === 'client';

  // Only fetched when a report actually asks for one, so choosing the cash
  // book does not go looking up the client list.
  const clients = useApi<{ data: Client[] }>(
    () =>
      needsClient
        ? api.clients({ search: clientSearch || undefined, limit: 20 })
        : Promise.resolve({ data: [] as Client[] }),
    [needsClient, clientSearch],
  );

  // The same check the API makes, so the button is disabled for the reason the
  // server would have given rather than for a rule invented here.
  const complaint = useMemo(
    () =>
      reportRequestError({
        kind,
        from: needsPeriod ? from : undefined,
        to: needsPeriod ? to : undefined,
        clientId: needsClient ? clientId ?? null : null,
      }),
    [kind, from, to, needsPeriod, needsClient, clientId],
  );

  async function submit() {
    setSaving(true);
    setFailed(null);
    try {
      await api.requestReport({
        kind,
        ...(needsPeriod ? { from, to } : {}),
        ...(needsClient && clientId ? { clientId } : {}),
      });
      router.push('/reports');
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'That did not work');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHead title="Ask for a report" subtitle="It is built in the background" />

      <Card>
        <Select
          label="Report"
          value={kind}
          onChange={setKind}
          options={REPORTS.map((report) => ({ value: report.kind, label: report.label }))}
        />
        {definition && <p className="t-tiny muted">{definition.description}</p>}
      </Card>

      {needsClient && (
        <Card>
          <SectionHead title="Client" />
          <p className={clientId ? 't-h3' : 't-tiny muted'}>
            {clientName || 'Nobody chosen yet'}
          </p>
          <Button
            title={clientId ? 'Choose a different client' : 'Choose a client'}
            variant="dark"
            size="sm"
            onClick={() => setClientSheet(true)}
          />
        </Card>
      )}

      {needsPeriod && (
        <Card>
          <SectionHead title="Period" />
          <Field label="From" type="date" value={from} onChange={setFrom} />
          <Field label="To" type="date" value={to} onChange={setTo} />
        </Card>
      )}

      {complaint && <p className="t-tiny" style={{ color: 'var(--danger)' }}>{complaint}</p>}
      {failed && <p className="t-tiny" style={{ color: 'var(--danger)' }}>{failed}</p>}

      <Button
        title="Ask for it"
        onClick={submit}
        loading={saving}
        disabled={Boolean(complaint) || saving}
      />

      <Sheet open={clientSheet} title="Pick a client" onClose={() => setClientSheet(false)}>
        <Field
          placeholder="Name or phone"
          icon="search"
          value={clientSearch}
          onChange={setClientSearch}
          autoFocus
          pasteable={false}
        />
        {(clients.data?.data ?? []).map((client) => (
          <SheetOption
            key={client.id}
            label={client.name}
            description={[client.code, client.phone].filter(Boolean).join(' · ')}
            selected={clientId === client.id}
            onClick={() => {
              setClientId(client.id);
              setClientName(client.name);
              setClientSheet(false);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}
