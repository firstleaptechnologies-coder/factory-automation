'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Employee, EmploymentStatus, WorkspaceUser } from '@decor/shared';
import { EMPLOYMENT_STATUS_LABELS, today } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Button, Card, Field, Loader, PageHead, SectionHead } from '@/ui';
import { Select } from '@/ui/Select';

/**
 * Add somebody, or correct their details.
 *
 * The identifiers are write-only here: what is stored is encrypted and what
 * comes back is the last four digits, so this form shows what is on file
 * rather than pretending to have the number. Typing a new one replaces it.
 */
export function EmployeeForm({ id }: { id?: string }) {
  const router = useRouter();
  const existing = useApi<Employee | null>(
    () => (id ? api.employee(id) : Promise.resolve(null)),
    [id],
  );
  const users = useApi<WorkspaceUser[]>(() => api.users(), []);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState('');
  const [joinedOn, setJoinedOn] = useState(today());
  const [status, setStatus] = useState<EmploymentStatus>('ACTIVE');
  const [userId, setUserId] = useState<string | null>(null);

  const [aadhaar, setAadhaar] = useState('');
  const [pan, setPan] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');

  const [address, setAddress] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const row = existing.data;
    if (!row) return;
    setName(row.name);
    setPhone(row.phone ?? '');
    setDesignation(row.designation ?? '');
    setDepartment(row.department ?? '');
    setJoinedOn(row.joinedOn.slice(0, 10));
    setStatus(row.status);
    setUserId(row.userId ?? null);
    setBankAccountName(row.bankAccountName ?? '');
    setBankIfsc(row.bankIfsc ?? '');
    setAddress(row.address ?? '');
    setEmergencyName(row.emergencyName ?? '');
    setEmergencyPhone(row.emergencyPhone ?? '');
  }, [existing.data]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        phone: phone.trim() || undefined,
        designation: designation.trim() || undefined,
        department: department.trim() || undefined,
        joinedOn,
        status,
        userId: userId ?? undefined,
        aadhaar: aadhaar.replace(/\s+/g, '') || undefined,
        pan: pan.trim().toUpperCase() || undefined,
        bankAccountName: bankAccountName.trim() || undefined,
        bankAccountNumber: bankAccountNumber.replace(/\s+/g, '') || undefined,
        bankIfsc: bankIfsc.trim().toUpperCase() || undefined,
        address: address.trim() || undefined,
        emergencyName: emergencyName.trim() || undefined,
        emergencyPhone: emergencyPhone.trim() || undefined,
      };
      const saved = id ? await api.updateEmployee(id, body) : await api.createEmployee(body);
      router.push(`/employees/${saved.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (existing.loading || users.loading) return <Loader />;
  const onFile = existing.data;

  return (
    <>
      <PageHead
        title={id ? 'Edit employee' : 'Add an employee'}
        subtitle={id ? onFile?.code : 'They need no login unless you give them one'}
      />

      <Card>
        <div className="grid-2">
          <Field label="Name" placeholder="Ramesh Kumar" value={name} onChange={setName} />
          <Field label="Phone" placeholder="98765 43210" value={phone} onChange={setPhone} />
          <Field
            label="What they do"
            placeholder="CNC operator"
            value={designation}
            onChange={setDesignation}
          />
          <Field
            label="Department"
            placeholder="Production"
            value={department}
            onChange={setDepartment}
          />
          <Field label="Joined on" type="date" value={joinedOn} onChange={setJoinedOn} />
          <Select
            label="Standing"
            value={status}
            options={(['ACTIVE', 'ON_LEAVE', 'LEFT'] as const).map((key) => ({
              value: key,
              label: EMPLOYMENT_STATUS_LABELS[key],
            }))}
            onChange={(value) => setStatus(value as EmploymentStatus)}
          />
        </div>

        <Select
          label="Login"
          hint="Most of the floor will never need one"
          value={userId ?? ''}
          options={[
            { value: '', label: 'No login' },
            ...(users.data ?? []).map((user) => ({
              value: user.id,
              label: `${user.name} · ${user.code}`,
            })),
          ]}
          onChange={(value) => setUserId(value || null)}
        />
      </Card>

      <Card style={{ marginTop: 'var(--s-lg)' }}>
        <SectionHead title="Identifiers" />
        <div className="t-tiny muted">
          Stored encrypted. Only the last four digits are ever shown.
        </div>
        <div className="grid-2">
          <Field
            label="Aadhaar"
            placeholder={
              onFile?.aadhaarLast4 ? `•••• •••• ${onFile.aadhaarLast4}` : '1234 1234 1234'
            }
            value={aadhaar}
            onChange={setAadhaar}
          />
          <Field
            label="PAN"
            placeholder={onFile?.panLast4 ? `•••••${onFile.panLast4}` : 'ABCDE1234F'}
            value={pan}
            onChange={setPan}
          />
        </div>
      </Card>

      <Card style={{ marginTop: 'var(--s-lg)' }}>
        <SectionHead title="Where the salary goes" />
        <div className="grid-2">
          <Field
            label="Account name"
            value={bankAccountName}
            onChange={setBankAccountName}
          />
          <Field
            label="Account number"
            placeholder={
              onFile?.bankAccountLast4 ? `•••••• ${onFile.bankAccountLast4}` : '50100123456789'
            }
            value={bankAccountNumber}
            onChange={setBankAccountNumber}
          />
          <Field label="IFSC" placeholder="HDFC0001234" value={bankIfsc} onChange={setBankIfsc} />
        </div>
      </Card>

      <Card style={{ marginTop: 'var(--s-lg)' }}>
        <SectionHead title="If something happens" />
        <Field label="Address" value={address} onChange={setAddress} multiline />
        <div className="grid-2">
          <Field label="Who to call" value={emergencyName} onChange={setEmergencyName} />
          <Field label="Their number" value={emergencyPhone} onChange={setEmergencyPhone} />
        </div>
      </Card>

      {error ? (
        <div className="t-small" style={{ color: 'var(--danger)', marginTop: 'var(--s-md)' }}>
          {error}
        </div>
      ) : null}

      <Button
        title={id ? 'Save' : 'Add them'}
        block
        loading={busy}
        disabled={name.trim().length < 2 || !joinedOn}
        onClick={submit}
        style={{ marginTop: 'var(--s-lg)' }}
      />
    </>
  );
}
