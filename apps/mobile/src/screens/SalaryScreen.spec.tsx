import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS, shiftMonth, thisMonth } from '@decor/shared';
import { SalaryScreen, monthOf } from './SalaryScreen';

const mockRuns = jest.fn();
const mockOpen = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    salaryRuns: () => mockRuns(),
    openSalaryRun: (...a: unknown[]) => mockOpen(...a),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const RUN = {
  id: 'r1',
  month: '2026-08-01',
  status: 'PAID',
  workingDays: 26,
  createdAt: '2026-09-01T00:00:00Z',
  _count: { payslips: 4 },
};

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.SALARY_VIEW, PERMISSIONS.SALARY_MANAGE];
  mockRuns.mockResolvedValue([RUN]);
  mockOpen.mockResolvedValue({ id: 'r2' });
});

const mount = async () => {
  await render(<SalaryScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockRuns).toHaveBeenCalled());
};

it('lists the months, by the month they pay for', async () => {
  await mount();
  expect(await screen.findByText('2026-08')).toBeTruthy();
  expect(screen.getByText('4 payslips · 26 working days')).toBeTruthy();
  expect(screen.getByText('Paid')).toBeTruthy();
});

it('reads the month off the first of it', () => {
  expect(monthOf({ month: '2026-08-01T00:00:00.000Z' })).toBe('2026-08');
});

it('opens last month by default, because this one is not over', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('open-month'));
  expect(await screen.findByDisplayValue(shiftMonth(thisMonth(), -1))).toBeTruthy();
});

it('asks how many days this shop calls a month', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('open-month'));
  // Some shops pay for 26 days and some for 30; a salary is divided by
  // whichever this one means.
  await fireEvent.press(await screen.findByText('30 days'));
  await fireEvent.press(screen.getByText('Work it out'));
  await waitFor(() =>
    expect(mockOpen).toHaveBeenCalledWith(
      expect.objectContaining({ workingDays: 30 }),
    ),
  );
});

it('goes straight to the draft it made', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('open-month'));
  await fireEvent.press(await screen.findByText('Work it out'));
  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('SalaryRun', { id: 'r2' }));
});

it('offers opening a month only to whoever may', async () => {
  mockPermissions = [PERMISSIONS.SALARY_VIEW];
  await mount();
  expect(screen.queryByTestId('open-month')).toBeNull();
});

it('says so plainly before any month has been opened', async () => {
  mockRuns.mockResolvedValue([]);
  await mount();
  expect(await screen.findByText('No month opened yet')).toBeTruthy();
});
