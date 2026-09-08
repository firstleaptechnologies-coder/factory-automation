'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SalaryRun, SalaryRunStatus } from '@decor/shared';
import { PERMISSIONS, SALARY_RUN_LABELS, shiftMonth, thisMonth } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { Button, Card, Chip, EmptyState, Field, Loader, PageHead, Pill, Sheet } from '@/ui';

/** The colour a month's standing reads as. */
const TONE: Record<SalaryRunStatus, string> = {
  DRAFT: 'var(--warning)',
  APPROVED: 'var(--info)',
  PAID: 'var(--success)',
};

export default function SalaryPage() {
  return (
    <Shell>
      <Salary />
    </Shell>
  );
}

/**
 * A month of pay at a time.
 *
 * Opening one drafts a payslip for everybody from the register and their
 * arrangements. Nothing has moved until somebody approves it and pays it —
 * two separate decisions, often two separate people.
 */
function Salary() {
  const router = useRouter();
  const { can } = useAuth();
  const runs = useApi<SalaryRun[]>(() => api.salaryRuns(), []);

  const [opening, setOpening] = useState(false);
  const [month, setMonth] = useState(shiftMonth(thisMonth(), -1));
  const [workingDays, setWorkingDays] = useState('26');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = can(PERMISSIONS.SALARY_MANAGE);
  const rows = runs.data ?? [];

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const run = await api.openSalaryRun({ month, workingDays: Number(workingDays) });
      setOpening(false);
      router.push(`/salary/${run.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title="Salary"
        subtitle="A month at a time"
        action={
          <div className="row">
            <Button
              title="How people are paid"
              variant="dark"
              icon="tune"
              onClick={() => router.push('/salary/structures')}
            />
            <Button
              title="Advances"
              variant="dark"
              onClick={() => router.push('/salary/advances')}
            />
            {canManage ? (
              <Button title="Open a month" icon="plus" onClick={() => setOpening(true)} />
            ) : null}
          </div>
        }
      />

      {runs.loading ? (
        <Loader />
      ) : rows.length === 0 ? (
        <EmptyState title="No month opened yet" />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Payslips</th>
                <th className="num">Working days</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((run) => (
                <tr
                  key={run.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/salary/${run.id}`)}>
                  <td className="bold">{run.month.slice(0, 7)}</td>
                  <td className="num muted">{run._count?.payslips ?? 0}</td>
                  <td className="num muted">{run.workingDays}</td>
                  <td>
                    <Pill label={SALARY_RUN_LABELS[run.status]} color={TONE[run.status]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Sheet
        open={opening}
        title="Open a month"
        subtitle="Everybody gets a draft payslip from the register and their arrangement"
        onClose={() => setOpening(false)}>
        <Field label="Month" type="month" value={month} onChange={setMonth} />
        <Field
          label="Working days"
          hint="How many days this shop calls a full month"
          value={workingDays}
          onChange={setWorkingDays}
        />
        <div className="row" style={{ marginBottom: 'var(--s-md)' }}>
          {['26', '30'].map((days) => (
            <Chip
              key={days}
              label={`${days} days`}
              selected={workingDays === days}
              onClick={() => setWorkingDays(days)}
            />
          ))}
        </div>
        {error ? (
          <div className="t-small" style={{ color: 'var(--danger)', marginBottom: 'var(--s-md)' }}>
            {error}
          </div>
        ) : null}
        <Button
          title="Work it out"
          block
          loading={busy}
          disabled={!month || !Number(workingDays)}
          onClick={open}
        />
      </Sheet>
    </>
  );
}
