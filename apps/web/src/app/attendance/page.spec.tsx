import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS, shiftDay, today } from '@decor/shared';
import AttendancePage from './page';

const apiMock = { attendanceDay: jest.fn(), markAttendance: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: never[]) =>
        (apiMock[key as keyof typeof apiMock] as (...a: never[]) => unknown)(...args),
    },
  ),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let permissions: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ can: (p: string) => permissions.includes(p) }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const employee = (id: string, name: string) => ({
  id,
  code: `EMP-000${id.slice(1)}`,
  name,
  designation: 'Operator',
  department: 'Production',
  status: 'ACTIVE',
});

const unmarked = (id: string, name: string) => ({
  employee: employee(id, name),
  marked: false,
  mark: null,
  overtimeMinutes: 0,
});

beforeEach(() => {
  jest.clearAllMocks();
  permissions = [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.ATTENDANCE_MARK];
  apiMock.attendanceDay.mockResolvedValue({
    date: today(),
    rows: [unmarked('e1', 'Ramesh'), unmarked('e2', 'Iqbal')],
  });
  apiMock.markAttendance.mockResolvedValue({ date: today(), rows: [] });
});

const mount = async () => {
  render(<AttendancePage />);
  await screen.findByText('Attendance');
};

it('opens on the day the shop is having, not on UTC', async () => {
  await mount();
  // Read as UTC, a shop in India opening the register before half past five
  // in the morning would be shown yesterday.
  expect(apiMock.attendanceDay).toHaveBeenCalledWith(today());
});

it('lists everybody, including whoever has not been marked', async () => {
  await mount();
  expect(await screen.findByText('Ramesh')).toBeInTheDocument();
  expect(screen.getByText('2 still to mark')).toBeInTheDocument();
});

it('saves the whole register in one go', async () => {
  await mount();
  await screen.findByText('Ramesh');
  fireEvent.click(screen.getAllByText('In')[0]);
  fireEvent.click(screen.getAllByText('Absent')[1]);
  fireEvent.click(screen.getByText('Save the register'));
  await waitFor(() =>
    expect(apiMock.markAttendance).toHaveBeenCalledWith(today(), [
      { employeeId: 'e1', mark: 'PRESENT' },
      { employeeId: 'e2', mark: 'ABSENT' },
    ]),
  );
});

it('marks everybody left in one click, leaving the chosen ones alone', async () => {
  await mount();
  await screen.findByText('Ramesh');
  fireEvent.click(screen.getAllByText('Absent')[0]);
  fireEvent.click(screen.getByText('Mark the rest off'));
  fireEvent.click(screen.getByText('Save the register'));
  await waitFor(() =>
    expect(apiMock.markAttendance).toHaveBeenCalledWith(today(), [
      { employeeId: 'e1', mark: 'ABSENT' },
      { employeeId: 'e2', mark: 'WEEKLY_OFF' },
    ]),
  );
});

it('steps a day without typing a date', async () => {
  await mount();
  fireEvent.click(screen.getByText('Yesterday'));
  await waitFor(() =>
    expect(apiMock.attendanceDay).toHaveBeenLastCalledWith(shiftDay(today(), -1)),
  );
});

it('offers no marking at all to somebody who may only look', async () => {
  permissions = [PERMISSIONS.ATTENDANCE_VIEW];
  await mount();
  expect(screen.queryByText('Save the register')).toBeNull();
  expect(screen.queryByText('Mark the rest in')).toBeNull();
});
