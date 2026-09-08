'use client';

import { Suspense, use, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Employee, EmployeeIdentifiers } from '@decor/shared';
import { EMPLOYMENT_STATUS_LABELS, PERMISSIONS, today } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { Button, Card, Field, Loader, PageHead, Pill, SectionHead, Sheet } from '@/ui';
import { formatDateShort } from '@/lib/format';
import { EmployeeForm } from '../EmployeeForm';

export default function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Shell>
      <Suspense fallback={<Loader />}>
        <Page id={id} />
      </Suspense>
    </Shell>
  );
}

/** The same route, reading or correcting — as a quote and an expense are. */
function Page({ id }: { id: string }) {
  const editing = useSearchParams().get('edit') === '1';
  return editing ? <EmployeeForm id={id} /> : <Detail id={id} />;
}

/** One person: what they do, what is on file, and how to reach them. */
function Detail({ id }: { id: string }) {
  const router = useRouter();
  const { can } = useAuth();
  const employee = useApi<Employee>(() => api.employee(id), [id]);

  const [secrets, setSecrets] = useState<EmployeeIdentifiers | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [leftOn, setLeftOn] = useState(today());
  const [busy, setBusy] = useState(false);

  const canManage = can(PERMISSIONS.EMPLOYEE_MANAGE);
  const canReveal = can(PERMISSIONS.EMPLOYEE_IDENTIFIERS);

  if (employee.loading) return <Loader />;
  const person = employee.data;
  if (!person) return null;

  const gone = person.status === 'LEFT';
  const onFile = person.aadhaarLast4 || person.panLast4 || person.bankAccountLast4;

  /**
   * Fetches the whole numbers, on purpose.
   *
   * They are not sent with the employee: a list of staff should not carry
   * every identifier in the shop through the browser, and asking for them by
   * name means "who read this person's Aadhaar" has an answer.
   */
  const reveal = async () => setSecrets(await api.employeeIdentifiers(id));

  return (
    <>
      <PageHead
        title={person.name}
        subtitle={`${person.code} · ${person.designation ?? 'No designation'}`}
        action={
          canManage ? (
            <div className="row">
              <Button
                title="Edit"
                variant="dark"
                icon="edit"
                onClick={() => router.push(`/employees/${id}?edit=1`)}
              />
              <Button
                title="Letters"
                variant="dark"
                icon="clipboard"
                onClick={() => router.push(`/employees/${id}/letters`)}
              />
              {gone ? null : (
                <Button
                  title="They have left"
                  variant="danger"
                  onClick={() => setLeaving(true)}
                />
              )}
            </div>
          ) : null
        }
      />

      <div className="grid-2">
        <Card size="sm">
          <SectionHead title="At work" />
          <Row label="Standing" value={EMPLOYMENT_STATUS_LABELS[person.status]} />
          <Row label="Department" value={person.department ?? '—'} />
          <Row label="Joined" value={formatDateShort(person.joinedOn)} />
          {person.leftOn ? <Row label="Left" value={formatDateShort(person.leftOn)} /> : null}
          <Row label="Phone" value={person.phone ?? '—'} />
          <Row
            label="Login"
            value={
              person.user
                ? `${person.user.name} · ${person.user.code}`
                : 'None — they do not use the app'
            }
          />
        </Card>

        <Card size="sm">
          <SectionHead title="Identifiers" />
          <div className="t-tiny muted">
            Stored encrypted. Only the last four digits are kept in the open.
          </div>
          <Row
            label="Aadhaar"
            value={
              secrets?.aadhaar ??
              (person.aadhaarLast4 ? `•••• •••• ${person.aadhaarLast4}` : 'Not on file')
            }
          />
          <Row
            label="PAN"
            value={secrets?.pan ?? (person.panLast4 ? `•••••${person.panLast4}` : 'Not on file')}
          />
          <Row
            label="Account"
            value={
              secrets?.bankAccountNumber ??
              (person.bankAccountLast4 ? `•••••• ${person.bankAccountLast4}` : 'Not on file')
            }
          />
          {person.bankIfsc ? <Row label="IFSC" value={person.bankIfsc} /> : null}
          {canReveal && !secrets && onFile ? (
            <Button title="Show the full numbers" variant="dark" onClick={reveal} />
          ) : null}
        </Card>
      </div>

      {person.address || person.emergencyName ? (
        <Card size="sm" style={{ marginTop: 'var(--s-lg)' }}>
          <SectionHead title="If something happens" />
          {person.address ? <Row label="Address" value={person.address} /> : null}
          {person.emergencyName ? (
            <Row
              label="Who to call"
              value={`${person.emergencyName}${
                person.emergencyPhone ? ` · ${person.emergencyPhone}` : ''
              }`}
            />
          ) : null}
        </Card>
      ) : null}

      <Sheet
        open={leaving}
        title="Mark them as left?"
        subtitle="The record stays — their attendance and payslips hang off it. Their login is switched off."
        onClose={() => setLeaving(false)}>
        <Field label="Last day" type="date" value={leftOn} onChange={setLeftOn} />
        <Button
          title="Save"
          block
          variant="danger"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.markEmployeeLeft(id, leftOn);
              setLeaving(false);
              employee.reload();
            } finally {
              setBusy(false);
            }
          }}
        />
      </Sheet>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="toolbar" style={{ gap: 'var(--s-md)' }}>
      <span className="t-tiny muted" style={{ flex: 1 }}>{label}</span>
      <span className="t-small">{value}</span>
    </div>
  );
}
