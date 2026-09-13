'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { REPORTS, reportDefinition, reportRequestError, thisMonth } from '@fas/shared';
import { api } from '@/lib/api';
import { Shell } from '@/components/Shell';
import { ClientPicker, NO_CLIENT, type ClientChoice } from '@/components/ClientPicker';
import { Button, Card, Field, PageHead, SectionHead } from '@/ui';
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

  const [client, setClient] = useState<ClientChoice>(NO_CLIENT);
  const clientId = client.client?.id;

  const definition = reportDefinition(kind);
  const needsPeriod = definition?.period !== 'none';
  const needsClient = definition?.subject === 'client';

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
          {/*
            * Search only. A report about somebody the shop has never traded
            * with has nothing in it, so offering to create one here would only
            * make an empty client and an empty report.
            */}
          <ClientPicker value={client} onChange={setClient} allowCreate={false} />
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
    </>
  );
}
