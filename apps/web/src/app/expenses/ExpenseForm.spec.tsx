import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExpenseForm } from './ExpenseForm';

const apiMock = {
  expenseOptions: jest.fn(),
  expense: jest.fn(),
  createExpense: jest.fn(),
  updateExpense: jest.fn(),
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

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const OPTIONS = {
  PAYMENT_TYPE: ['Cash', 'UPI'],
  DONE_BY: ['Nakul'],
  VENDOR: ['Self'],
  SPENT_TYPE: ['Tooling'],
  TO_NAME: ['Sharma Tools'],
};

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.expenseOptions.mockResolvedValue(OPTIONS);
  apiMock.createExpense.mockResolvedValue({ id: 'e9' });
  apiMock.updateExpense.mockResolvedValue({ id: 'e1' });
});

const mount = async (id?: string) => {
  render(<ExpenseForm id={id} />);
  await screen.findByText(id ? 'Edit expense' : 'Record an expense');
};

/** Fills in the five dropdowns, in the order the form asks for them. */
function pickAll() {
  const wanted = ['Tooling', 'Cash', 'Nakul', 'Sharma Tools', 'Self'];
  wanted.forEach((label, index) => {
    fireEvent.click(screen.getAllByRole('button', { name: /Select…|Tooling|Cash|Nakul|Sharma Tools|Self/ })[index]);
    fireEvent.click(screen.getByRole('option', { name: label }));
  });
}

it('will not record an expense with a list left unanswered', async () => {
  await mount();
  fireEvent.change(screen.getByPlaceholderText('Router bits, diesel, shop rent'), {
    target: { value: 'Router bits' },
  });
  // Each of the five is a column on the row and a line in the ledger; an
  // expense missing one is a row nobody can account for later.
  expect(screen.getByRole('button', { name: 'Record it' })).toBeDisabled();
});

it('sends what was typed, with the labels the shop keeps', async () => {
  await mount();
  fireEvent.change(screen.getByPlaceholderText('Router bits, diesel, shop rent'), {
    target: { value: 'Router bits' },
  });
  fireEvent.change(screen.getAllByPlaceholderText('0')[0], { target: { value: '4500' } });
  pickAll();
  fireEvent.click(screen.getByRole('button', { name: 'Record it' }));

  await waitFor(() =>
    expect(apiMock.createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Router bits',
        amount: 4500,
        spentType: 'Tooling',
        paymentType: 'Cash',
        doneBy: 'Nakul',
        toName: 'Sharma Tools',
        vendor: 'Self',
      }),
    ),
  );
  expect(push).toHaveBeenCalledWith('/expenses/e9');
});

it('keeps the tax half folded away until it is wanted', async () => {
  await mount();
  expect(screen.queryByPlaceholderText('27AAACH7409R1ZZ')).toBeNull();
  fireEvent.click(screen.getByText('Off'));
  expect(await screen.findByPlaceholderText('27AAACH7409R1ZZ')).toBeInTheDocument();
});

it('opens an existing expense with its tax details already showing', async () => {
  apiMock.expense.mockResolvedValue({
    id: 'e1',
    date: '2026-09-08',
    description: 'Sheet stock',
    amount: 11800,
    paymentType: 'UPI',
    doneBy: 'Nakul',
    vendor: 'Self',
    spentType: 'Tooling',
    toName: 'Sharma Tools',
    vendorGstin: '09AAACH7409R1ZZ',
    taxAmount: 1800,
    itcEligible: true,
  });
  await mount('e1');
  expect(await screen.findByDisplayValue('Sheet stock')).toBeInTheDocument();
  // It was recorded with a GSTIN, so hiding that half would hide a correction
  // somebody came here to make.
  expect(screen.getByDisplayValue('09AAACH7409R1ZZ')).toBeInTheDocument();
});

it('corrects an expense rather than recording a second one', async () => {
  apiMock.expense.mockResolvedValue({
    id: 'e1',
    date: '2026-09-08',
    description: 'Sheet stock',
    amount: 11800,
    paymentType: 'UPI',
    doneBy: 'Nakul',
    vendor: 'Self',
    spentType: 'Tooling',
    toName: 'Sharma Tools',
    itcEligible: false,
  });
  await mount('e1');
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
  await waitFor(() => expect(apiMock.updateExpense).toHaveBeenCalledWith('e1', expect.anything()));
  expect(apiMock.createExpense).not.toHaveBeenCalled();
});
