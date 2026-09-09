import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS, shiftMonth, thisMonth } from '@fas/shared';
import SalaryPage from './page';

const apiMock = { salaryRuns: jest.fn(), openSalaryRun: jest.fn() };
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

const RUN = {
  id: 'r1',
  month: '2026-08-01',
  status: 'PAID',
  workingDays: 26,
  createdAt: '2026-09-01T00:00:00Z',
  _count: { payslips: 4 },
};

beforeEach(() => {
  jest.clearAllMocks();
  permissions = [PERMISSIONS.SALARY_VIEW, PERMISSIONS.SALARY_MANAGE];
  apiMock.salaryRuns.mockResolvedValue([RUN]);
  apiMock.openSalaryRun.mockResolvedValue({ id: 'r2' });
});

const mount = async () => {
  render(<SalaryPage />);
  await screen.findByText('Salary');
};

it('lists the months by the month they pay for', async () => {
  await mount();
  expect(await screen.findByText('2026-08')).toBeInTheDocument();
  expect(screen.getByText('Paid')).toBeInTheDocument();
});

it('opens last month by default, because this one is not over', async () => {
  await mount();
  fireEvent.click(screen.getByText('Open a month'));
  expect(await screen.findByDisplayValue(shiftMonth(thisMonth(), -1))).toBeInTheDocument();
});

it('asks how many days this shop calls a month', async () => {
  await mount();
  fireEvent.click(screen.getByText('Open a month'));
  // Some shops pay for 26 days and some for 30; a salary is divided by
  // whichever this one means.
  fireEvent.click(await screen.findByText('30 days'));
  fireEvent.click(screen.getByText('Work it out'));
  await waitFor(() =>
    expect(apiMock.openSalaryRun).toHaveBeenCalledWith(
      expect.objectContaining({ workingDays: 30 }),
    ),
  );
});

it('goes straight to the draft it made', async () => {
  await mount();
  fireEvent.click(screen.getByText('Open a month'));
  fireEvent.click(await screen.findByText('Work it out'));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/salary/r2'));
});

it('says why a month could not be opened, rather than nothing', async () => {
  apiMock.openSalaryRun.mockRejectedValue(new Error('That month is already open.'));
  await mount();
  fireEvent.click(screen.getByText('Open a month'));
  fireEvent.click(await screen.findByText('Work it out'));
  expect(await screen.findByText('That month is already open.')).toBeInTheDocument();
});

it('offers opening a month only to whoever may', async () => {
  permissions = [PERMISSIONS.SALARY_VIEW];
  await mount();
  expect(screen.queryByText('Open a month')).toBeNull();
});
