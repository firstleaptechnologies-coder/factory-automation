import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@decor/shared';
import PayStructuresPage from './page';

const apiMock = { payStructures: jest.fn(), employees: jest.fn(), setPayStructure: jest.fn() };
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

const CURRENT = {
  id: 's2',
  employeeId: 'e1',
  employee: { id: 'e1', code: 'EMP-0001', name: 'Ramesh' },
  kind: 'MONTHLY',
  rate: 30000,
  overtimeHourlyRate: 150,
  effectiveFrom: '2026-10-01',
  effectiveTo: null,
  createdAt: '2026-09-09T00:00:00Z',
};

const REPLACED = {
  ...CURRENT,
  id: 's1',
  rate: 26000,
  overtimeHourlyRate: null,
  effectiveFrom: '2026-01-01',
  effectiveTo: '2026-09-30',
};

beforeEach(() => {
  jest.clearAllMocks();
  permissions = [PERMISSIONS.SALARY_VIEW, PERMISSIONS.SALARY_MANAGE];
  apiMock.payStructures.mockResolvedValue([CURRENT, REPLACED]);
  apiMock.employees.mockResolvedValue({
    data: [{ id: 'e1', code: 'EMP-0001', name: 'Ramesh' }],
    meta: { page: 1, pages: 1, total: 1, limit: 200 },
  });
  apiMock.setPayStructure.mockResolvedValue(CURRENT);
});

const mount = async () => {
  render(<PayStructuresPage />);
  await screen.findByText('How people are paid');
};

/** The wells the form opens: who, then how they are paid. */
const triggers = () =>
  [...document.querySelectorAll('.select-trigger')] as HTMLElement[];

it('shows the arrangement that was replaced, not only the current one', async () => {
  await mount();
  // A raise is a new row, so this list is a history as much as a setting.
  expect(await screen.findByText('₹30,000')).toBeInTheDocument();
  expect(screen.getByText('₹26,000')).toBeInTheDocument();
  expect(screen.getByText('Replaced')).toBeInTheDocument();
});

it('says what an hour of overtime is worth, where one is set', async () => {
  await mount();
  expect(await screen.findByText('₹150/h')).toBeInTheDocument();
});

it('asks what a piece is, and only for piece work', async () => {
  await mount();
  fireEvent.click(screen.getByText('New arrangement'));
  // "Per piece" on a payslip tells nobody anything; "per panel" does.
  expect(screen.queryByPlaceholderText('panel')).toBeNull();
  fireEvent.click(triggers()[1]);
  fireEvent.click(await screen.findByRole('option', { name: /Per piece/ }));
  expect(await screen.findByPlaceholderText('panel')).toBeInTheDocument();
});

it('will not save piece work with no word for a piece', async () => {
  await mount();
  fireEvent.click(screen.getByText('New arrangement'));
  fireEvent.click(triggers()[1]);
  fireEvent.click(await screen.findByRole('option', { name: /Per piece/ }));
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});

it('offers setting pay only to whoever may', async () => {
  permissions = [PERMISSIONS.SALARY_VIEW];
  await mount();
  expect(screen.queryByText('New arrangement')).toBeNull();
});
