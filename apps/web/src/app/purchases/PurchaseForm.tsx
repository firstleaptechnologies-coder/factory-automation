'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Material, Purchase, Vendor } from '@fas/shared';
import { today } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Button, Card, Field, Loader, PageHead, SectionHead } from '@/ui';
import { Select } from '@/ui/Select';
import { formatInr } from '@/lib/format';

/** One line as the form holds it, before it is a number anywhere. */
export interface DraftLine {
  materialId: string | null;
  thicknessId: string | null;
  quantity: string;
  rate: string;
  taxAmount: string;
}

const EMPTY: DraftLine = {
  materialId: null,
  thicknessId: null,
  quantity: '',
  rate: '',
  taxAmount: '',
};

/** What a line comes to, for the running total on screen. */
export function lineAmount(line: DraftLine): number {
  return Number(line.quantity || 0) * Number(line.rate || 0) + Number(line.taxAmount || 0);
}

/**
 * Writing an order.
 *
 * The tax is typed rather than worked out from a rate: a vendor's bill is a
 * document with figures on it, and those figures are what the shop owes
 * whatever this would have calculated.
 */
export function PurchaseForm({ id }: { id?: string }) {
  const router = useRouter();
  const vendors = useApi<{ data: Vendor[] }>(() => api.vendors({ limit: 200 }), []);
  const materials = useApi<Material[]>(() => api.materials(), []);
  const existing = useApi<Purchase | null>(
    () => (id ? api.purchase(id) : Promise.resolve(null)),
    [id],
  );

  const [vendorId, setVendorId] = useState<string | null>(null);
  const [expectedOn, setExpectedOn] = useState(today());
  const [otherCharges, setOtherCharges] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([EMPTY]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const row = existing.data;
    if (!row) return;
    setVendorId(row.vendorId);
    setExpectedOn(row.expectedOn?.slice(0, 10) ?? today());
    setOtherCharges(Number(row.otherCharges) ? String(row.otherCharges) : '');
    setNote(row.note ?? '');
    setLines(
      (row.items ?? []).map((item) => ({
        materialId: item.materialId,
        thicknessId: item.thicknessId ?? null,
        quantity: String(item.quantity),
        rate: String(item.rate),
        taxAmount: Number(item.taxAmount) ? String(item.taxAmount) : '',
      })),
    );
  }, [existing.data]);

  if (vendors.loading || existing.loading) return <Loader />;

  const setLine = (index: number, patch: Partial<DraftLine>) =>
    setLines((current) =>
      current.map((line, at) => (at === index ? { ...line, ...patch } : line)),
    );

  const thicknessesFor = (materialId: string | null) =>
    (materials.data ?? []).find((material) => material.id === materialId)?.thicknesses ?? [];

  const filled = lines.filter((line) => line.materialId && Number(line.quantity) > 0);
  const total =
    lines.reduce((sum, line) => sum + lineAmount(line), 0) + Number(otherCharges || 0);

  return (
    <>
      <PageHead
        title={id ? 'Edit order' : 'New order'}
        subtitle="A draft until it is sent"
      />

      <Card>
        <div className="grid-2">
          <Select
            label="Vendor"
            value={vendorId}
            options={(vendors.data?.data ?? []).map((vendor) => ({
              value: vendor.id,
              label: `${vendor.name} · ${vendor.code}`,
            }))}
            onChange={setVendorId}
          />
          <Field label="Expected" type="date" value={expectedOn} onChange={setExpectedOn} />
        </div>
      </Card>

      {lines.map((line, index) => (
        <Card key={index} style={{ marginTop: 'var(--s-lg)' }}>
          <SectionHead
            title={`Line ${index + 1}`}
            action={
              lines.length > 1 ? (
                <Button
                  title="Remove"
                  variant="dark"
                  size="sm"
                  onClick={() =>
                    setLines((current) => current.filter((_, at) => at !== index))
                  }
                />
              ) : undefined
            }
          />
          <div className="grid-2">
            <Select
              label="Material"
              value={line.materialId}
              options={(materials.data ?? []).map((material) => ({
                value: material.id,
                label: material.name,
              }))}
              onChange={(value) => setLine(index, { materialId: value, thicknessId: null })}
            />
            {thicknessesFor(line.materialId).length > 0 ? (
              <Select
                label="Thickness"
                value={line.thicknessId}
                options={thicknessesFor(line.materialId).map((thickness) => ({
                  value: thickness.id,
                  label: thickness.label ?? `${thickness.valueMm} mm`,
                }))}
                onChange={(value) => setLine(index, { thicknessId: value })}
              />
            ) : null}
            <Field
              label="How many"
              value={line.quantity}
              onChange={(value) => setLine(index, { quantity: value })}
            />
            <Field
              label="Rate each"
              value={line.rate}
              onChange={(value) => setLine(index, { rate: value })}
            />
            <Field
              label="Tax on this line"
              hint="As the vendor wrote it"
              value={line.taxAmount}
              onChange={(value) => setLine(index, { taxAmount: value })}
            />
          </div>
          <div className="t-small muted">{formatInr(lineAmount(line))}</div>
        </Card>
      ))}

      <Button
        title="Another line"
        variant="dark"
        icon="plus"
        onClick={() => setLines((current) => [...current, EMPTY])}
        style={{ marginTop: 'var(--s-md)' }}
      />

      <Card style={{ marginTop: 'var(--s-lg)' }}>
        <div className="grid-2">
          <Field
            label="Freight, loading, round-off"
            value={otherCharges}
            onChange={setOtherCharges}
          />
          <Field label="Note" value={note} onChange={setNote} />
        </div>
      </Card>

      <Card tone="accent" style={{ marginTop: 'var(--s-lg)' }}>
        <span className="t-label on-accent" style={{ opacity: 0.75 }}>
          {filled.length} {filled.length === 1 ? 'line' : 'lines'}
        </span>
        <div className="t-display on-accent">{formatInr(total)}</div>
      </Card>

      {error ? (
        <div className="t-small" style={{ color: 'var(--danger)', marginTop: 'var(--s-md)' }}>
          {error}
        </div>
      ) : null}

      <Button
        title={id ? 'Save the draft' : 'Write it'}
        block
        loading={busy}
        disabled={!vendorId || filled.length === 0}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const body = {
              vendorId: vendorId!,
              expectedOn,
              otherCharges: otherCharges ? Number(otherCharges) : undefined,
              note: note.trim() || undefined,
              items: filled.map((line) => ({
                materialId: line.materialId!,
                thicknessId: line.thicknessId ?? undefined,
                quantity: Number(line.quantity),
                rate: Number(line.rate || 0),
                taxAmount: line.taxAmount ? Number(line.taxAmount) : undefined,
              })),
            };
            const saved = id
              ? await api.updatePurchase(id, body)
              : await api.createPurchase(body);
            router.push(`/purchases/${saved.id}`);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
          } finally {
            setBusy(false);
          }
        }}
        style={{ marginTop: 'var(--s-lg)' }}
      />
    </>
  );
}
