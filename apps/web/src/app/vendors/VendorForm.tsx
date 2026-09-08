'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Vendor } from '@decor/shared';
import { PERMISSIONS } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Button, Card, Field, Loader, PageHead } from '@/ui';

/**
 * One vendor, read and written on the same page.
 *
 * There is not enough to a vendor to justify a form of its own: a name, a
 * number, a GSTIN and what they supply. Splitting it would be two pages for
 * eight fields.
 */
export function VendorForm({ id }: { id?: string }) {
  const router = useRouter();
  const { can } = useAuth();
  const existing = useApi<Vendor | null>(
    () => (id ? api.vendor(id) : Promise.resolve(null)),
    [id],
  );

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [company, setCompany] = useState('');
  const [supplies, setSupplies] = useState('');
  const [address, setAddress] = useState('');
  const [terms, setTerms] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = can(PERMISSIONS.VENDOR_MANAGE);

  useEffect(() => {
    const row = existing.data;
    if (!row) return;
    setName(row.name);
    setPhone(row.phone ?? '');
    setGstin(row.gstin ?? '');
    setCompany(row.company ?? '');
    setSupplies(row.supplies ?? '');
    setAddress(row.address ?? '');
    setTerms(row.paymentTermDays == null ? '' : String(row.paymentTermDays));
  }, [existing.data]);

  if (existing.loading) return <Loader />;
  const vendor = existing.data;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        phone: phone.trim() || undefined,
        gstin: gstin.trim().toUpperCase(),
        company: company.trim() || undefined,
        supplies: supplies.trim() || undefined,
        address: address.trim() || undefined,
        paymentTermDays: terms ? Number(terms) : undefined,
      };
      const saved = id ? await api.updateVendor(id, body) : await api.createVendor(body);
      router.push(`/vendors/${saved.id}`);
      existing.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title={id ? (vendor?.name ?? 'Vendor') : 'New vendor'}
        subtitle={vendor ? `${vendor.code}${vendor.isActive ? '' : ' · retired'}` : undefined}
        action={
          canManage && id && vendor?.isActive ? (
            <Button
              title="Retire"
              variant="danger"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.retireVendor(id);
                  existing.reload();
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : null
        }
      />

      <Card>
        <div className="grid-2">
          <Field label="Name" placeholder="Verma Boards" value={name} onChange={setName} />
          <Field label="Phone" value={phone} onChange={setPhone} />
          <Field
            label="What they supply"
            placeholder="Boards, hardware, adhesives"
            value={supplies}
            onChange={setSupplies}
          />
          <Field label="Trading name" value={company} onChange={setCompany} />
          <Field
            label="GSTIN"
            placeholder="08AAACH7409R1ZS"
            value={gstin}
            onChange={setGstin}
          />
          <Field label="Usually paid in (days)" value={terms} onChange={setTerms} />
        </div>
        <Field label="Address" value={address} onChange={setAddress} multiline />
      </Card>

      {error ? (
        <div className="t-small" style={{ color: 'var(--danger)', marginTop: 'var(--s-md)' }}>
          {error}
        </div>
      ) : null}

      {canManage ? (
        <Button
          title={id ? 'Save' : 'Add them'}
          block
          loading={busy}
          disabled={name.trim().length < 2}
          onClick={save}
          style={{ marginTop: 'var(--s-lg)' }}
        />
      ) : (
        <div className="t-small faint" style={{ marginTop: 'var(--s-lg)' }}>
          You may look at vendors but not change them.
        </div>
      )}
    </>
  );
}
