'use client';

import { useState } from 'react';
import type { Employee, PayKind, PayStructure } from '@decor/shared';
import {
  PAY_KINDS,
  PAY_KIND_HINTS,
  PAY_KIND_LABELS,
  PERMISSIONS,
  today,
} from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { Button, Card, EmptyState, Field, Loader, PageHead, Pill, Sheet } from '@/ui';
import { Select } from '@/ui/Select';
import { formatDateShort, formatInr } from '@/lib/format';

export default function PayStructuresPage() {
  return (
    <Shell>
      <Structures />
    </Shell>
  );
}

/**
 * How each person is paid.
 *
 * A raise is a new arrangement rather than an edit, so this list is a history
 * as much as a setting: last month's payslip has to still divide by last
 * month's rate, and the row that produced it stays here saying so.
 */
function Structures() {
  const { can } = useAuth();
  const structures = useApi<PayStructure[]>(() => api.payStructures(), []);
  const people = useApi<{ data: Employee[] }>(() => api.employees({ limit: 200 }), []);

  const [sheet, setSheet] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [kind, setKind] = useState<PayKind>('MONTHLY');
  const [rate, setRate] = useState('');
  const [pieceLabel, setPieceLabel] = useState('');
  const [overtime, setOvertime] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = can(PERMISSIONS.SALARY_MANAGE);
  const rows = structures.data ?? [];

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.setPayStructure({
        employeeId: employeeId!,
        kind,
        rate: Number(rate),
        pieceLabel: kind === 'PIECE' ? pieceLabel.trim() : undefined,
        overtimeHourlyRate: overtime ? Number(overtime) : undefined,
        effectiveFrom,
      });
      setSheet(false);
      setRate('');
      structures.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title="How people are paid"
        subtitle="A raise is a new arrangement, not an edit"
        action={
          canManage ? (
            <Button title="New arrangement" icon="plus" onClick={() => setSheet(true)} />
          ) : null
        }
      />

      {structures.loading ? (
        <Loader />
      ) : rows.length === 0 ? (
        <EmptyState title="Nobody is on a pay arrangement yet" />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Who</th>
                <th>Paid how</th>
                <th className="num">Rate</th>
                <th className="num">Overtime</th>
                <th>From</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((structure) => (
                <tr key={structure.id}>
                  <td className="bold">{structure.employee?.name ?? 'Unknown'}</td>
                  <td className="muted">
                    {PAY_KIND_LABELS[structure.kind]}
                    {structure.pieceLabel ? (
                      <div className="t-tiny faint">per {structure.pieceLabel}</div>
                    ) : null}
                  </td>
                  <td className="num">{formatInr(structure.rate)}</td>
                  <td className="num muted">
                    {structure.overtimeHourlyRate
                      ? `${formatInr(structure.overtimeHourlyRate)}/h`
                      : '—'}
                  </td>
                  <td className="muted">
                    {formatDateShort(structure.effectiveFrom)}
                    {structure.effectiveTo ? (
                      <div className="t-tiny faint">
                        to {formatDateShort(structure.effectiveTo)}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {structure.effectiveTo ? (
                      <Pill label="Replaced" color="var(--text-faint)" />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Sheet
        open={sheet}
        title="New arrangement"
        subtitle="It replaces whatever they were on, from the day it starts"
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
        <Select
          label="Paid how"
          hint={PAY_KIND_HINTS[kind]}
          value={kind}
          options={PAY_KINDS.map((key) => ({ value: key, label: PAY_KIND_LABELS[key] }))}
          onChange={(value) => setKind(value as PayKind)}
        />
        <Field label="Rate" value={rate} onChange={setRate} />
        {kind === 'PIECE' ? (
          <Field label="A piece is" placeholder="panel" value={pieceLabel} onChange={setPieceLabel} />
        ) : null}
        <Field
          label="Overtime an hour"
          hint="Leave empty if this arrangement pays none"
          value={overtime}
          onChange={setOvertime}
        />
        <Field label="From" type="date" value={effectiveFrom} onChange={setEffectiveFrom} />
        {error ? (
          <div className="t-small" style={{ color: 'var(--danger)', marginBottom: 'var(--s-md)' }}>
            {error}
          </div>
        ) : null}
        <Button
          title="Save"
          block
          loading={busy}
          disabled={!employeeId || !Number(rate) || (kind === 'PIECE' && !pieceLabel.trim())}
          onClick={save}
        />
      </Sheet>
    </>
  );
}
