'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Expense, ExpenseFormOptions, ExpenseOptionField } from '@fas/shared';
import { EXPENSE_FIELD_HINTS, EXPENSE_FIELD_LABELS, today } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Button, Card, Chip, Field, Loader, PageHead } from '@/ui';
import { Select } from '@/ui/Select';

/** The order the form asks for the five lists in. */
const FIELDS: ExpenseOptionField[] = [
  'SPENT_TYPE',
  'PAYMENT_TYPE',
  'DONE_BY',
  'TO_NAME',
  'VENDOR',
];

/**
 * Record what was spent, or correct it.
 *
 * Five of these fields are lists the shop keeps itself, so nothing here is
 * hard-coded: a shop that starts buying from somebody new adds the name on the
 * dropdowns screen rather than asking for a release.
 */
export function ExpenseForm({ id }: { id?: string }) {
  const router = useRouter();
  const options = useApi<ExpenseFormOptions>(() => api.expenseOptions(), []);
  const existing = useApi<Expense | null>(
    () => (id ? api.expense(id) : Promise.resolve(null)),
    [id],
  );

  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [choice, setChoice] = useState<Record<ExpenseOptionField, string | null>>({
    PAYMENT_TYPE: null,
    DONE_BY: null,
    VENDOR: null,
    SPENT_TYPE: null,
    TO_NAME: null,
  });
  const [note, setNote] = useState('');
  /** Why this is being corrected — about the edit, not the spending. */
  const [editNote, setEditNote] = useState('');

  // The tax half stays folded away: most expenses at a counter have no bill
  // worth claiming, and a form that asks for a GSTIN every time is a form
  // people stop filling in.
  const [taxOpen, setTaxOpen] = useState(false);
  const [vendorGstin, setVendorGstin] = useState('');
  const [taxableValue, setTaxableValue] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [itcEligible, setItcEligible] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const row = existing.data;
    if (!row) return;
    setDate(row.date.slice(0, 10));
    setDescription(row.description);
    setAmount(String(row.amount));
    setChoice({
      PAYMENT_TYPE: row.paymentType,
      DONE_BY: row.doneBy,
      VENDOR: row.vendor,
      SPENT_TYPE: row.spentType,
      TO_NAME: row.toName,
    });
    setNote(row.note ?? '');
    setVendorGstin(row.vendorGstin ?? '');
    setTaxableValue(row.taxableValue == null ? '' : String(row.taxableValue));
    setTaxAmount(row.taxAmount == null ? '' : String(row.taxAmount));
    setItcEligible(row.itcEligible);
    if (row.vendorGstin || row.taxAmount != null) setTaxOpen(true);
  }, [existing.data]);

  const missing =
    !description.trim() ||
    !amount ||
    Number(amount) <= 0 ||
    Object.values(choice).some((value) => !value);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        date,
        description: description.trim(),
        amount: Number(amount),
        paymentType: choice.PAYMENT_TYPE!,
        doneBy: choice.DONE_BY!,
        vendor: choice.VENDOR!,
        spentType: choice.SPENT_TYPE!,
        toName: choice.TO_NAME!,
        note: note.trim() || undefined,
        editNote: id ? editNote.trim() || undefined : undefined,
        vendorGstin: vendorGstin.trim() || undefined,
        taxableValue: taxableValue ? Number(taxableValue) : undefined,
        taxAmount: taxAmount ? Number(taxAmount) : undefined,
        itcEligible,
      };
      const saved = id ? await api.updateExpense(id, body) : await api.createExpense(body);
      router.push(`/expenses/${saved.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (options.loading || existing.loading) return <Loader />;

  return (
    <>
      <PageHead
        title={id ? 'Edit expense' : 'Record an expense'}
        subtitle={id ? 'Corrects the books with it' : 'Posts to the ledger as it saves'}
      />

      <Card>
        <Field
          label="What was it for"
          placeholder="Router bits, diesel, shop rent"
          value={description}
          onChange={setDescription}
        />
        <div className="grid-2">
          <Field label="Amount" placeholder="0" value={amount} onChange={setAmount} />
          <Field label="Date" type="date" value={date} onChange={setDate} />
        </div>

        <div className="grid-2">
          {FIELDS.map((field) => (
            <Select
              key={field}
              label={EXPENSE_FIELD_LABELS[field]}
              hint={
                (options.data?.[field] ?? []).length === 0
                  ? 'Nothing on this list yet — add one in settings'
                  : EXPENSE_FIELD_HINTS[field]
              }
              value={choice[field]}
              options={(options.data?.[field] ?? []).map((label) => ({
                value: label,
                label,
              }))}
              onChange={(value) => setChoice((prev) => ({ ...prev, [field]: value }))}
            />
          ))}
        </div>

        <Field
          label="Note"
          placeholder="Anything worth remembering"
          value={note}
          onChange={setNote}
          multiline
        />

        {id ? (
          <Field
            label="Why the change"
            placeholder="The bill was for two sheets, not three"
            value={editNote}
            onChange={setEditNote}
          />
        ) : null}
      </Card>

      <Card style={{ marginTop: 'var(--s-lg)' }}>
        <div className="toolbar">
          <div style={{ flex: 1 }}>
            <div className="t-label">Tax on this bill</div>
            <div className="t-tiny muted">
              An expense whose tax can be claimed is a different number to the accountant
            </div>
          </div>
          <Chip
            label={taxOpen ? 'On' : 'Off'}
            selected={taxOpen}
            onClick={() => setTaxOpen((open) => !open)}
          />
        </div>

        {taxOpen ? (
          <div style={{ marginTop: 'var(--s-md)' }}>
            <div className="grid-2">
              <Field
                label="Vendor GSTIN"
                placeholder="27AAACH7409R1ZZ"
                value={vendorGstin}
                onChange={setVendorGstin}
              />
              <Field
                label="Taxable value"
                placeholder="0"
                value={taxableValue}
                onChange={setTaxableValue}
              />
              <Field label="Tax" placeholder="0" value={taxAmount} onChange={setTaxAmount} />
            </div>
            <div className="toolbar">
              <div className="t-label" style={{ flex: 1 }}>
                Input credit can be claimed
              </div>
              <Chip
                label={itcEligible ? 'Yes' : 'No'}
                selected={itcEligible}
                onClick={() => setItcEligible((claimable) => !claimable)}
              />
            </div>
          </div>
        ) : null}
      </Card>

      {error ? (
        <div className="t-small" style={{ color: 'var(--danger)', marginTop: 'var(--s-md)' }}>
          {error}
        </div>
      ) : null}

      <Button
        title={id ? 'Save' : 'Record it'}
        block
        loading={busy}
        disabled={missing}
        onClick={submit}
        style={{ marginTop: 'var(--s-lg)' }}
      />
    </>
  );
}
