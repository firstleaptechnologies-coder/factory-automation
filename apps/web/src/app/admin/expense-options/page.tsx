'use client';

import { useState } from 'react';
import type { ExpenseOption, ExpenseOptionField } from '@fas/shared';
import {
  EXPENSE_FIELD_HINTS,
  EXPENSE_FIELD_LABELS,
  EXPENSE_OPTION_FIELDS,
} from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Shell } from '@/components/Shell';
import { Button, Card, Chip, Field, Loader, PageHead, Pill, Sheet } from '@/ui';
import { Select } from '@/ui/Select';

export default function ExpenseOptionsPage() {
  return (
    <Shell>
      <Options />
    </Shell>
  );
}

/**
 * The five lists behind the expense form, kept by the shop.
 *
 * This is the screen that means an expense form never needs a developer. A
 * retired option stays on the rows that used it — an expense stores the label
 * rather than a reference — so hiding one changes what can be picked next,
 * never what was recorded last March.
 */
function Options() {
  const options = useApi<ExpenseOption[]>(() => api.allExpenseOptions(), []);
  const [field, setField] = useState<ExpenseOptionField>('SPENT_TYPE');
  const [sheet, setSheet] = useState(false);
  const [label, setLabel] = useState('');
  const [account, setAccount] = useState<'CASH' | 'BANK'>('BANK');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      options.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (options.loading) return <Loader />;
  const rows = (options.data ?? []).filter((option) => option.field === field);

  return (
    <>
      <PageHead
        title="Expense dropdowns"
        subtitle="Every list on the expense form, kept by the shop"
        action={
          <Button
            title={`Add to ${EXPENSE_FIELD_LABELS[field].toLowerCase()}`}
            icon="plus"
            onClick={() => setSheet(true)}
          />
        }
      />

      <div className="row">
        {EXPENSE_OPTION_FIELDS.map((key) => (
          <Chip
            key={key}
            label={EXPENSE_FIELD_LABELS[key]}
            selected={field === key}
            onClick={() => setField(key)}
          />
        ))}
      </div>

      <div className="t-tiny muted" style={{ margin: 'var(--s-sm) 0 var(--s-lg)' }}>
        {EXPENSE_FIELD_HINTS[field]}
      </div>

      {error ? (
        <div className="t-small" style={{ color: 'var(--danger)', marginBottom: 'var(--s-md)' }}>
          {error}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="t-small faint">Nothing on this list yet.</div>
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                {field === 'PAYMENT_TYPE' ? <th>Comes out of</th> : null}
                <th />
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((option) => (
                <tr key={option.id}>
                  <td className="bold">{option.label}</td>
                  {field === 'PAYMENT_TYPE' ? (
                    <td className="muted">
                      {option.account === 'CASH' ? 'The drawer' : 'The bank'}
                    </td>
                  ) : null}
                  <td>
                    {option.isActive ? null : (
                      <Pill label="Hidden" color="var(--text-faint)" />
                    )}
                  </td>
                  <td>
                    <Chip
                      label={option.isActive ? 'Hide' : 'Show'}
                      onClick={() =>
                        run(() =>
                          option.isActive
                            ? api.deleteExpenseOption(option.id)
                            : api.updateExpenseOption(option.id, { isActive: true }),
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Sheet
        open={sheet}
        title={`New ${EXPENSE_FIELD_LABELS[field].toLowerCase()}`}
        subtitle={EXPENSE_FIELD_HINTS[field]}
        onClose={() => setSheet(false)}>
        <Field label="Name" value={label} onChange={setLabel} autoFocus />
        {field === 'PAYMENT_TYPE' ? (
          <Select
            label="Comes out of"
            hint="Cash leaves the drawer; anything else leaves the bank"
            value={account}
            options={[
              { value: 'CASH', label: 'Cash in hand' },
              { value: 'BANK', label: 'The bank' },
            ]}
            onChange={(value) => setAccount(value as 'CASH' | 'BANK')}
          />
        ) : null}
        <Button
          title="Add"
          block
          loading={busy}
          disabled={!label.trim()}
          onClick={() =>
            run(async () => {
              await api.createExpenseOption({
                field,
                label: label.trim(),
                // Only a way of paying comes out of a drawer.
                ...(field === 'PAYMENT_TYPE' ? { account } : {}),
              });
              setLabel('');
              setSheet(false);
            })
          }
        />
      </Sheet>
    </>
  );
}
