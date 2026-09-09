'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { REPORTS, reportDefinition, reportRequestError, thisMonth } from '@decor/shared';
import { api } from '@/lib/api';
import { Shell } from '@/components/Shell';
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
 * The catalogue comes from `@decor/shared`, so this screen cannot offer a
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

  const definition = reportDefinition(kind);
  const needsPeriod = definition?.period !== 'none';

  // The same check the API makes, so the button is disabled for the reason the
  // server would have given rather than for a rule invented here.
  const complaint = useMemo(
    () =>
      reportRequestError({
        kind,
        from: needsPeriod ? from : undefined,
        to: needsPeriod ? to : undefined,
        // A client statement needs one, and choosing a client is not built
        // yet — the catalogue says so and this says so with it.
        clientId: definition?.subject === 'client' ? undefined : null,
      }),
    [kind, from, to, needsPeriod, definition],
  );

  async function submit() {
    setSaving(true);
    setFailed(null);
    try {
      await api.requestReport({
        kind,
        ...(needsPeriod ? { from, to } : {}),
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
