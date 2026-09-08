'use client';

import { useState } from 'react';
import type { AttendanceMonth } from '@decor/shared';
import { monthBounds, shiftMonth, thisMonth } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Shell } from '@/components/Shell';
import { Button, Card, EmptyState, Field, Loader, PageHead } from '@/ui';

/** Hours and minutes, because 90 minutes reads worse than 1h 30m. */
export function formatMinutes(minutes: number): string {
  if (!minutes) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h${rest ? ` ${rest}m` : ''}` : `${rest}m`;
}

export default function AttendanceMonthPage() {
  return (
    <Shell>
      <Month />
    </Shell>
  );
}

/**
 * What each person's month came to.
 *
 * The figure the salary run reads, shown before anybody is paid from it: a
 * shop that disagrees with the days should find out here rather than on a
 * payslip.
 */
function Month() {
  const [month, setMonth] = useState(thisMonth());
  const summary = useApi<AttendanceMonth>(
    () => api.attendanceSummary(monthBounds(month)),
    [month],
  );

  const rows = summary.data?.rows ?? [];

  return (
    <>
      <PageHead
        title="The month"
        subtitle="What the salary run will read"
        action={
          <div className="row">
            <Button
              title="Previous"
              variant="dark"
              onClick={() => setMonth(shiftMonth(month, -1))}
            />
            <div style={{ minWidth: 150 }}>
              <Field
                label="Month"
                type="month"
                value={month}
                onChange={setMonth}
                style={{ marginBottom: 0 }}
              />
            </div>
            <Button
              title="Next"
              variant="dark"
              onClick={() => setMonth(shiftMonth(month, 1))}
            />
          </div>
        }
      />

      {summary.loading ? (
        <Loader />
      ) : rows.length === 0 ? (
        <EmptyState title="Nobody on the list" />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="num">Payable days</th>
                <th className="num">In</th>
                <th className="num">Half</th>
                <th className="num">Absent</th>
                <th className="num">Leave</th>
                <th className="num">Off</th>
                <th className="num">Overtime</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.employee.id}>
                  <td className="bold">
                    {row.employee.name}
                    <div className="t-tiny faint">
                      {row.employee.designation ?? row.employee.code}
                    </div>
                  </td>
                  <td className="num bold">{row.payableDays}</td>
                  <td className="num muted">{row.present}</td>
                  <td className="num muted">{row.halfDays}</td>
                  <td className="num muted">{row.absent}</td>
                  <td className="num muted">{row.leave}</td>
                  <td className="num muted">{row.holidays}</td>
                  <td className="num muted">{formatMinutes(row.overtimeMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
