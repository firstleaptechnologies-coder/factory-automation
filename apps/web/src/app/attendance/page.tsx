'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AttendanceDay, AttendanceMark, MarkInput } from '@decor/shared';
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_MARKS,
  PERMISSIONS,
  shiftDay,
  today,
} from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { Button, Card, Chip, EmptyState, Field, Loader, PageHead } from '@/ui';

/** The colour each mark reads as. */
const TONE: Record<AttendanceMark, string> = {
  PRESENT: 'var(--success)',
  HALF_DAY: 'var(--warning)',
  ABSENT: 'var(--danger)',
  LEAVE: 'var(--info)',
  HOLIDAY: 'var(--text-muted)',
  WEEKLY_OFF: 'var(--text-faint)',
};

export default function AttendancePage() {
  return (
    <Shell>
      <Register />
    </Shell>
  );
}

/**
 * Marking in and marking out, never punching.
 *
 * The whole shop on one screen, marked in one go: that is how somebody at the
 * door actually does it, and saving a row at a time would leave half a
 * register on a morning the network was bad.
 */
function Register() {
  const router = useRouter();
  const { can } = useAuth();
  const [date, setDate] = useState(today());
  const register = useApi<AttendanceDay>(() => api.attendanceDay(date), [date]);

  /** What is on screen but not yet saved. */
  const [draft, setDraft] = useState<Record<string, AttendanceMark>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const rows = register.data?.rows ?? [];
    setDraft(
      Object.fromEntries(
        rows.filter((row) => row.mark).map((row) => [row.employee.id, row.mark!]),
      ),
    );
  }, [register.data]);

  const canMark = can(PERMISSIONS.ATTENDANCE_MARK);
  const rows = register.data?.rows ?? [];
  const unmarked = rows.filter((row) => !draft[row.employee.id]).length;

  const save = async () => {
    const marks: MarkInput[] = Object.entries(draft).map(([employeeId, mark]) => ({
      employeeId,
      mark,
    }));
    if (!marks.length) return;

    setBusy(true);
    try {
      await api.markAttendance(date, marks);
      register.reload();
    } finally {
      setBusy(false);
    }
  };

  /** Marks everybody who has not been marked yet. */
  const markRest = (mark: AttendanceMark) =>
    setDraft((current) => {
      const next = { ...current };
      for (const row of rows) if (!next[row.employee.id]) next[row.employee.id] = mark;
      return next;
    });

  return (
    <>
      <PageHead
        title="Attendance"
        subtitle="Marked in and out — not punched"
        action={
          <div className="row">
            <Button
              title="The month"
              variant="dark"
              icon="history"
              onClick={() => router.push('/attendance/month')}
            />
            {canMark ? (
              <Button
                title="Save the register"
                loading={busy}
                disabled={Object.keys(draft).length === 0}
                onClick={save}
              />
            ) : null}
          </div>
        }
      />

      <div className="toolbar">
        <Button
          title="Yesterday"
          variant="dark"
          onClick={() => setDate(shiftDay(date, -1))}
        />
        <div style={{ minWidth: 160 }}>
          <Field
            label="Day"
            type="date"
            value={date}
            onChange={setDate}
            style={{ marginBottom: 0 }}
          />
        </div>
        <Button
          title="Tomorrow"
          variant="dark"
          onClick={() => setDate(shiftDay(date, 1))}
        />
        <span className="t-small muted" style={{ flex: 1 }}>
          {unmarked === 0 ? 'Everybody marked' : `${unmarked} still to mark`}
        </span>
        {canMark && unmarked > 0 ? (
          <>
            <Chip label="Mark the rest in" onClick={() => markRest('PRESENT')} />
            <Chip label="Mark the rest off" onClick={() => markRest('WEEKLY_OFF')} />
          </>
        ) : null}
      </div>

      <div style={{ height: 'var(--s-lg)' }} />

      {register.loading ? (
        <Loader />
      ) : rows.length === 0 ? (
        <EmptyState title="Nobody to mark" />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>What they do</th>
                <th>Marked</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.employee.id}>
                  <td className="bold">{row.employee.name}</td>
                  <td className="muted">{row.employee.designation ?? row.employee.code}</td>
                  <td>
                    <div className="row">
                      {ATTENDANCE_MARKS.map((mark) => (
                        <Chip
                          key={mark}
                          label={ATTENDANCE_LABELS[mark]}
                          selected={draft[row.employee.id] === mark}
                          onClick={
                            canMark
                              ? () =>
                                  setDraft((current) => ({
                                    ...current,
                                    [row.employee.id]: mark,
                                  }))
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  </td>
                  <td className="t-tiny faint">{row.markedBy?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
