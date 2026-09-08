import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExpenseOptionsPage from './page';

const apiMock = {
  allExpenseOptions: jest.fn(),
  createExpenseOption: jest.fn(),
  updateExpenseOption: jest.fn(),
  deleteExpenseOption: jest.fn(),
};
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...args),
    },
  ),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ROWS = [
  { id: 'o1', field: 'SPENT_TYPE', label: 'Rent', isActive: true, sortOrder: 10 },
  { id: 'o2', field: 'SPENT_TYPE', label: 'Diesel', isActive: false, sortOrder: 20 },
  { id: 'o3', field: 'PAYMENT_TYPE', label: 'Cash', account: 'CASH', isActive: true, sortOrder: 10 },
  { id: 'o4', field: 'PAYMENT_TYPE', label: 'UPI', account: 'BANK', isActive: true, sortOrder: 20 },
];

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.allExpenseOptions.mockResolvedValue(ROWS);
  apiMock.createExpenseOption.mockResolvedValue({ id: 'o9' });
  apiMock.updateExpenseOption.mockResolvedValue({ id: 'o2' });
  apiMock.deleteExpenseOption.mockResolvedValue({ id: 'o1' });
});

const mount = async () => {
  render(<ExpenseOptionsPage />);
  await screen.findByText('Expense dropdowns');
};

it('shows one list at a time, starting with the categories', async () => {
  await mount();
  expect(await screen.findByText('Rent')).toBeInTheDocument();
  expect(screen.queryByText('UPI')).toBeNull();
});

it('says which drawer each way of paying comes out of', async () => {
  await mount();
  fireEvent.click(screen.getByText('Paid by'));
  // The shop names its own payment types, so only it can say which are cash —
  // and cash in hand is wrong the moment this is.
  expect(await screen.findByText('The drawer')).toBeInTheDocument();
  expect(screen.getByText('The bank')).toBeInTheDocument();
});

it('marks a hidden option rather than dropping it from the screen', async () => {
  await mount();
  // Expenses store the label, so a hidden option is still on last March's rows.
  expect(await screen.findByText('Diesel')).toBeInTheDocument();
  expect(screen.getByText('Hidden')).toBeInTheDocument();
});

it('hides an option instead of deleting it', async () => {
  await mount();
  fireEvent.click(screen.getAllByText('Hide')[0]);
  await waitFor(() => expect(apiMock.deleteExpenseOption).toHaveBeenCalledWith('o1'));
});

it('brings a hidden one back', async () => {
  await mount();
  fireEvent.click(await screen.findByText('Show'));
  await waitFor(() =>
    expect(apiMock.updateExpenseOption).toHaveBeenCalledWith('o2', { isActive: true }),
  );
});

it('adds a category without asking which account it comes out of', async () => {
  await mount();
  fireEvent.click(screen.getByText('Add to category'));
  fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Freight' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() =>
    expect(apiMock.createExpenseOption).toHaveBeenCalledWith({
      field: 'SPENT_TYPE',
      label: 'Freight',
    }),
  );
});

it('asks which account a new way of paying comes out of', async () => {
  await mount();
  fireEvent.click(screen.getByText('Paid by'));
  fireEvent.click(screen.getByText('Add to paid by'));
  fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Owner card' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() =>
    expect(apiMock.createExpenseOption).toHaveBeenCalledWith({
      field: 'PAYMENT_TYPE',
      label: 'Owner card',
      account: 'BANK',
    }),
  );
});
