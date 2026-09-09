import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { shiftMonth, thisMonth } from '@fas/shared';
import { AttendanceMonthScreen, formatMinutes } from './AttendanceMonthScreen';

const mockSummary = jest.fn();
jest.mock('../api/client', () => ({
  api: { attendanceSummary: (...a: unknown[]) => mockSummary(...a) },
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

const navigation = { goBack: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockSummary.mockResolvedValue({ from: '2026-09-01', to: '2026-09-30', rows: [ROW] });
});

const mount = async () => {
  await render(<AttendanceMonthScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockSummary).toHaveBeenCalled());
};

it('asks for the whole of this month, in local days', async () => {
  await mount();
  const month = thisMonth();
  expect(mockSummary).toHaveBeenCalledWith({
    from: `${month}-01`,
    to: expect.stringContaining(month),
  });
});

it('leads with the number a salary run will read', async () => {
  await mount();
  // A shop that disagrees with the days should find out here, not on a payslip.
  expect(await screen.findByText('25')).toBeTruthy();
  expect(screen.getByText('payable days')).toBeTruthy();
});

it('breaks the month down underneath it', async () => {
  await mount();
  expect(
    await screen.findByText(/24 in · 2 half · 1 absent · 1 leave · 4 off · OT 2h 30m/),
  ).toBeTruthy();
});

it('steps to another month without typing', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('next-month'));
  const next = shiftMonth(thisMonth(), 1);
  await waitFor(() =>
    expect(mockSummary).toHaveBeenLastCalledWith({
      from: `${next}-01`,
      to: expect.stringContaining(next),
    }),
  );
});

it('reads overtime as hours and minutes', () => {
  // 90 minutes reads worse than 1h 30m to somebody signing off a payslip.
  expect(formatMinutes(150)).toBe('2h 30m');
  expect(formatMinutes(120)).toBe('2h');
  expect(formatMinutes(45)).toBe('45m');
  expect(formatMinutes(0)).toBe('—');
});
