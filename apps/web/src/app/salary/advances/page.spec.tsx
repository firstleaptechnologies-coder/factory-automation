import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@decor/shared';
import SalaryAdvancesPage, { outstanding } from './page';

const apiMock = { salaryAdvances: jest.fn(), employees: jest.fn(), giveSalaryAdvance: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: never[]) =>
        (apiMock[key as keyof typeof apiMock] as (...a: never[]) => unknown)(...args),
    },
  ),
}));

let permissions: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ can: (p: string) => permissions.includes(p) }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ADVANCE = {
  id: 'a1',
  employeeId: 'e1',
  employee: { id: 'e1', code: 'EMP-0001', name: 'Ramesh' },
  amount: 5000,
  givenOn: '2026-09-05',
  mode: 'CASH',
  recoveredAmount: 2000,
  note: 'For the festival',
  createdAt: '2026-09-05T00:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  permissions = [PERMISSIONS.SALARY_VIEW, PERMISSIONS.SALARY_MANAGE];
  apiMock.salaryAdvances.mockResolvedValue([ADVANCE]);
  apiMock.employees.mockResolvedValue({
    data: [{ id: 'e1', code: 'EMP-0001', name: 'Ramesh' }],
    meta: { page: 1, pages: 1, total: 1, limit: 200 },
  });
  apiMock.giveSalaryAdvance.mockResolvedValue(ADVANCE);
});

const mount = async () => {
  render(<SalaryAdvancesPage />);
  await screen.findByText('Advances');
};

it('leads with what is still to come back', async () => {
  await mount();
  expect(await screen.findByText('₹3,000')).toBeInTheDocument();
  expect(screen.getByText('₹3,000 left')).toBeInTheDocument();
});

it('works out what is left on one', () => {
  expect(outstanding({ amount: 5000, recoveredAmount: 2000 } as never)).toBe(3000);
  // Never negative, however the recovery was recorded.
  expect(outstanding({ amount: 5000, recoveredAmount: 6000 } as never)).toBe(0);
});

it('says when one has been paid back', async () => {
  apiMock.salaryAdvances.mockResolvedValue([{ ...ADVANCE, recoveredAmount: 5000 }]);
  await mount();
  expect(await screen.findByText('Recovered')).toBeInTheDocument();
});

it('says an advance leaves the drawer today', async () => {
  await mount();
  fireEvent.click(screen.getByText('Give an advance'));
  expect(await screen.findByText(/leaves the drawer today/)).toBeInTheDocument();
});

it('offers giving one only to whoever may', async () => {
  permissions = [PERMISSIONS.SALARY_VIEW];
  await mount();
  expect(screen.queryByText('Give an advance')).toBeNull();
});
