'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Payslip, SalaryRunDetail } from '@decor/shared';
import { PERMISSIONS, SALARY_RUN_LABELS } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { Button, Card, Field, Loader, PageHead, Pill, Sheet } from '@/ui';
import { Select } from '@/ui/Select';
import { formatInr } from '@/lib/format';

export default function SalaryRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Shell>
      <Run id={id} />
    </Shell>
  );
}

/**
 * One month, person by person.
 *
 * The lines are shown rather than the total alone: somebody is going to check
 * this by hand, and a bare figure is one they have to take on trust.
 */
function Run({ id }: { id: string }) {
  const router = useRouter();
  const { can } = useAuth();
  const run = useApi<SalaryRunDetail>(() => api.salaryRun(id), [id]);

  const [editing, setEditing] = useState<Payslip | null>(null);
  const [pieces, setPieces] = useState('');
  const [deduction, setDeduction] = useState('');
  const [deductionNote, setDeductionNote] = useState('');
  const [paying, setPaying] = useState(false);
  const [mode, setMode] = useState<'CASH' | 'ONLINE'>('ONLINE');
  const [busy, setBusy] = useState(false);

  const canManage = can(PERMISSIONS.SALARY_MANAGE);
  const canPay = can(PERMISSIONS.SALARY_PAY);

  if (run.loading) return <Loader />;
  const data = run.data;
  if (!data) return null;

  const draft = data.status === 'DRAFT';
  const paid = data.status === 'PAID';

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      run.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title={data.month.slice(0, 7)}
        subtitle={`${data.workingDays} working days · ${SALARY_RUN_LABELS[data.status]}`}
        action={
          <div className="row">
            {canManage && draft ? (
              <>
                <Button
                  title="Approve"
                  loading={busy}
                  onClick={() => act(() => api.approveSalaryRun(id))}
                />
                <Button
                  title="Throw away"
                  variant="danger"
                  loading={busy}
                  onClick={() =>
                    act(async () => {
                      await api.discardSalaryRun(id);
                      router.push('/salary');
                    })
                  }
                />
              </>
            ) : null}
            {canPay && data.status === 'APPROVED' ? (
              <Button title="Pay it" onClick={() => setPaying(true)} />
            ) : null}
          </div>
        }
      />

      <Card tone="accent" className="enter">
        <span className="t-label on-accent" style={{ opacity: 0.75 }}>
          {data.totals.count} {data.totals.count === 1 ? 'payslip' : 'payslips'}
        </span>
        <div className="t-display on-accent">{formatInr(data.totals.net)}</div>
        <div className="t-small on-accent" style={{ opacity: 0.8, marginTop: 4 }}>
          {formatInr(data.totals.gross)} earned, less {formatInr(data.totals.advances)} advanced
          {data.totals.deductions > 0
            ? ` and ${formatInr(data.totals.deductions)} held back`
            : ''}
        </div>
      </Card>

      <div style={{ height: 'var(--s-lg)' }} />

      <Card size="sm" className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>What made it up</th>
              <th className="num">Gross</th>
              <th className="num">Advance</th>
              <th className="num">Held back</th>
              <th className="num">Net</th>
            </tr>
          </thead>
          <tbody>
            {data.payslips.map((slip) => (
              <tr
                key={slip.id}
                style={{ cursor: canManage && !paid ? 'pointer' : 'default' }}
                onClick={
                  canManage && !paid
                    ? () => {
                        setEditing(slip);
                        setPieces(slip.pieces == null ? '' : String(slip.pieces));
                        setDeduction(
                          Number(slip.otherDeductions) ? String(slip.otherDeductions) : '',
                        );
                        setDeductionNote(slip.deductionNote ?? '');
                      }
                    : undefined
                }>
                <td className="bold">
                  {slip.employee.name}
                  <div className="t-tiny faint">
                    {slip.payableDays} days
                    {slip.overtimeMinutes ? ` · ${slip.overtimeMinutes}m overtime` : ''}
                  </div>
                </td>
                <td className="muted">
                  {slip.lines.map((line, index) => (
                    <div key={`${line.kind}-${index}`} className="t-tiny">
                      {line.label} · {line.quantity} × {formatInr(line.rate)} ={' '}
                      {formatInr(line.amount)}
                    </div>
                  ))}
                </td>
                <td className="num">{formatInr(slip.gross)}</td>
                <td className="num muted">
                  {Number(slip.advanceDeducted) ? `− ${formatInr(slip.advanceDeducted)}` : '—'}
                </td>
                <td className="num muted">
                  {Number(slip.otherDeductions) ? `− ${formatInr(slip.otherDeductions)}` : '—'}
                </td>
                <td className="num bold">{formatInr(slip.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {paid ? (
        <div className="t-tiny faint" style={{ marginTop: 'var(--s-lg)' }}>
          Paid. Every payslip posted to the ledger on its own line, so the month can be
          reconciled person by person.
        </div>
      ) : null}

      <Sheet
        open={Boolean(editing)}
        title={editing?.employee.name ?? ''}
        subtitle="Piece counts and anything held back"
        onClose={() => setEditing(null)}>
        <Field
          label="Pieces"
          hint="How many they made this month"
          value={pieces}
          onChange={setPieces}
        />
        <Field label="Held back" value={deduction} onChange={setDeduction} />
        <Field label="What for" value={deductionNote} onChange={setDeductionNote} />
        <Button
          title="Save"
          block
          loading={busy}
          onClick={() =>
            act(async () => {
              await api.adjustPayslip(id, editing!.id, {
                pieces: pieces ? Number(pieces) : undefined,
                otherDeductions: deduction ? Number(deduction) : undefined,
                deductionNote: deductionNote.trim() || undefined,
              });
              setEditing(null);
            })
          }
        />
      </Sheet>

      <Sheet
        open={paying}
        title="Pay this month?"
        subtitle="One ledger entry per person, so the month reconciles against people rather than a total."
        onClose={() => setPaying(false)}>
        <Select
          label="Paid by"
          value={mode}
          options={[
            { value: 'ONLINE', label: 'Bank transfer' },
            { value: 'CASH', label: 'Cash' },
          ]}
          onChange={(value) => setMode(value as 'CASH' | 'ONLINE')}
        />
        <Button
          title="Pay it"
          block
          loading={busy}
          onClick={() =>
            act(async () => {
              await api.paySalaryRun(id, mode);
              setPaying(false);
            })
          }
        />
      </Sheet>
    </>
  );
}
