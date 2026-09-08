import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { shiftMonth, thisMonth } from '@decor/shared';
import AttendanceMonthPage from './page';
import { formatMinutes } from './formatMinutes';

const apiMock = { attendanceSummary: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: never[]) =>
        (apiMock[key as keyof typeof apiMock] as (...a: never[]) => unknown)(...args),
    },
  ),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ROW = {
  employee: {
    id: 'e1',
    code: 'EMP-0001',
    name: 'Ramesh',
    designation: 'Operator',
    department: 'Production',
    status: 'ACTIVE',
  },
  present: 24,
  halfDays: 2,
  absent: 1,
  leave: 1,
  holidays: 4,
  payableDays: 25,
  overtimeMinutes: 150,
};

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.attendanceSummary.mockResolvedValue({
    from: '2026-09-01',
    to: '2026-09-30',
    rows: [ROW],
  });
});

const mount = async () => {
  render(<AttendanceMonthPage />);
  await screen.findByText('The month');
};

it('asks for the whole of this month, in local days', async () => {
  await mount();
  const month = thisMonth();
  expect(apiMock.attendanceSummary).toHaveBeenCalledWith({
    from: `${month}-01`,
    to: expect.stringContaining(month),
  });
});

it('leads with the number a salary run will read', async () => {
  await mount();
  // A shop that disagrees with the days should find out here, not on a payslip.
  expect(await screen.findByText('25')).toBeInTheDocument();
  expect(screen.getByText('Payable days')).toBeInTheDocument();
});

it('steps to another month without typing', async () => {
  await mount();
  fireEvent.click(screen.getByText('Previous'));
  const previous = shiftMonth(thisMonth(), -1);
  await waitFor(() =>
    expect(apiMock.attendanceSummary).toHaveBeenLastCalledWith({
      from: `${previous}-01`,
      to: expect.stringContaining(previous),
    }),
  );
});

it('reads overtime as hours and minutes', () => {
  expect(formatMinutes(150)).toBe('2h 30m');
  expect(formatMinutes(120)).toBe('2h');
  expect(formatMinutes(45)).toBe('45m');
  expect(formatMinutes(0)).toBe('—');
});
