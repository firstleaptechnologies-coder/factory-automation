'use client';

import { useState } from 'react';
import type { Employee, SalaryAdvance } from '@decor/shared';
import { PERMISSIONS, today } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { Button, Card, EmptyState, Field, Loader, PageHead, Pill, Sheet } from '@/ui';
import { Select } from '@/ui/Select';
import { formatDateShort, formatInr } from '@/lib/format';

/** What is still owed on one advance. */
export function outstanding(advance: SalaryAdvance): number {
  return Math.max(0, Number(advance.amount) - Number(advance.recoveredAmount));
}

export default function SalaryAdvancesPage() {
  return (
    <Shell>
      <Advances />
    </Shell>
  );
}

/**
 * Money handed over before it is earned.
 *
 * It leaves the drawer the day it is given — so it posts to the ledger then,
 * not when a payslip eventually takes it back. Recording it only as a
 * deduction would have the cash position wrong for however long that took.
 */
function Advances() {
  const { can } = useAuth();
  const advances = useApi<SalaryAdvance[]>(() => api.salaryAdvances(), []);
  const people = useApi<{ data: Employee[] }>(() => api.employees({ limit: 200 }), []);

  const [sheet, setSheet] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [givenOn, setGivenOn] = useState(today());
  const [mode, setMode] = useState<'CASH' | 'ONLINE'>('CASH');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const canManage = can(PERMISSIONS.SALARY_MANAGE);
  const rows = advances.data ?? [];
  const owed = rows.reduce((total, advance) => total + outstanding(advance), 0);

  return (
    <>
      <PageHead
        title="Advances"
        subtitle="Paid before it was earned"
        action={
          canManage ? (
            <Button title="Give an advance" icon="plus" onClick={() => setSheet(true)} />
          ) : null
        }
      />

      <Card tone="accent" className="enter">
        <span className="t-label on-accent" style={{ opacity: 0.75 }}>
          Still to come back
        </span>
        <div className="t-display on-accent">{formatInr(owed)}</div>
      </Card>

      <div style={{ height: 'var(--s-lg)' }} />

      {advances.loading ? (
        <Loader />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing advanced" />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Who</th>
                <th>When</th>
                <th>Paid by</th>
                <th className="num">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((advance) => {
                const left = outstanding(advance);
                return (
                  <tr key={advance.id}>
                    <td className="bold">
                      {advance.employee?.name ?? 'Unknown'}
                      {advance.note ? <div className="t-tiny faint">{advance.note}</div> : null}
                    </td>
                    <td className="muted">{formatDateShort(advance.givenOn)}</td>
                    <td className="muted">{advance.mode === 'CASH' ? 'Cash' : 'Bank'}</td>
                    <td className="num">{formatInr(advance.amount)}</td>
                    <td>
                      <Pill
                        label={left > 0 ? `${formatInr(left)} left` : 'Recovered'}
                        color={left > 0 ? 'var(--warning)' : 'var(--success)'}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Sheet
        open={sheet}
        title="Give an advance"
        subtitle="It leaves the drawer today and comes off a payslip later"
        onClose={() => setSheet(false)}>
        <Select
          label="Who"
          value={employeeId}
          options={(people.data?.data ?? []).map((person) => ({
            value: person.id,
            label: `${person.name} · ${person.code}`,
          }))}
          onChange={setEmployeeId}
        />
        <Field label="Amount" value={amount} onChange={setAmount} />
        <Select
          label="Paid by"
          value={mode}
          options={[
            { value: 'CASH', label: 'Cash' },
            { value: 'ONLINE', label: 'Bank transfer' },
          ]}
          onChange={(value) => setMode(value as 'CASH' | 'ONLINE')}
        />
        <Field label="When" type="date" value={givenOn} onChange={setGivenOn} />
        <Field label="Note" value={note} onChange={setNote} />
        <Button
          title="Give it"
          block
          loading={busy}
          disabled={!employeeId || !Number(amount)}
          onClick={async () => {
            setBusy(true);
            try {
              await api.giveSalaryAdvance({
                employeeId: employeeId!,
                amount: Number(amount),
                givenOn,
                mode,
                note: note.trim() || undefined,
              });
              setSheet(false);
              setAmount('');
              setNote('');
              advances.reload();
            } finally {
              setBusy(false);
            }
          }}
        />
      </Sheet>
    </>
  );
}
