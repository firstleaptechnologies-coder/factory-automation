import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@decor/shared';
import ExpensesPage from './page';

const apiMock = { expenses: jest.fn(), expenseOptions: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...args),
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

const ROW = {
  id: 'e1',
  date: '2026-09-08',
  description: 'Router bits',
  amount: 4500,
  paymentType: 'Cash',
  doneBy: 'Nakul',
  toName: 'Sharma Tools',
  vendor: 'Self',
  spentType: 'Tooling',
  itcEligible: false,
};

const page = (rows: unknown[], total = 4500) => ({
  total,
  data: rows,
  meta: { page: 1, limit: 25, total: rows.length, pages: 1 },
});

beforeEach(() => {
  jest.clearAllMocks();
  permissions = [PERMISSIONS.EXPENSE_VIEW, PERMISSIONS.EXPENSE_MANAGE];
  apiMock.expenses.mockResolvedValue(page([ROW]));
  apiMock.expenseOptions.mockResolvedValue({
    PAYMENT_TYPE: ['Cash', 'UPI'],
    DONE_BY: ['Nakul'],
    VENDOR: ['Self'],
    SPENT_TYPE: ['Tooling', 'Rent'],
    TO_NAME: ['Sharma Tools'],
  });
});

async function mount() {
  render(<ExpensesPage />);
  await screen.findByText('Expenses');
}

it('totals the whole filtered set, not the page on screen', async () => {
  apiMock.expenses.mockResolvedValue(page([ROW], 128000));
  await mount();
  expect(await screen.findByText('₹1,28,000')).toBeInTheDocument();
});

it('says what each expense was, and on whose account', async () => {
  await mount();
  expect(await screen.findByText('Router bits')).toBeInTheDocument();
  expect(screen.getByText('Sharma Tools')).toBeInTheDocument();
  expect(screen.getByText('Nakul')).toBeInTheDocument();
});

it('offers the shop its own categories to filter by', async () => {
  await mount();
  fireEvent.click(screen.getByText('Filter'));
  // Not a fixed list in the app: a category added this morning filters today.
  expect(await screen.findByText('Rent')).toBeInTheDocument();
});

it('asks the server for the filter that was applied', async () => {
  await mount();
  fireEvent.click(screen.getByText('Filter'));
  fireEvent.click(await screen.findByText('Rent'));
  fireEvent.click(screen.getByText(/Apply/));
  await waitFor(() =>
    expect(apiMock.expenses).toHaveBeenLastCalledWith(
      expect.objectContaining({ spentType: 'Rent' }),
    ),
  );
});

it('offers to record one only to somebody who may', async () => {
  permissions = [PERMISSIONS.EXPENSE_VIEW];
  await mount();
  expect(screen.queryByText('Record one')).toBeNull();
});

it('opens the form and one expense', async () => {
  await mount();
  fireEvent.click(screen.getByText('Record one'));
  expect(push).toHaveBeenCalledWith('/expenses/new');
  fireEvent.click(await screen.findByText('Router bits'));
  expect(push).toHaveBeenCalledWith('/expenses/e1');
});

it('says so plainly when nothing has been recorded', async () => {
  apiMock.expenses.mockResolvedValue(page([], 0));
  await mount();
  expect(await screen.findByText('Nothing recorded yet')).toBeInTheDocument();
});
