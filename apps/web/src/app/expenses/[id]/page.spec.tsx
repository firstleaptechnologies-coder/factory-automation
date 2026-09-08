import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { PERMISSIONS } from '@decor/shared';
import ExpensePage from './page';

const apiMock = {
  expense: jest.fn(),
  history: jest.fn(),
  deleteExpense: jest.fn(),
  expenseOptions: jest.fn(),
  attachExpenseBill: jest.fn(),
  removeExpenseBill: jest.fn(),
  fileUrl: jest.fn((id: string) => `http://api.test/files/${id}`),
};
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
let query = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => query,
}));

let permissions: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ can: (p: string) => permissions.includes(p) }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const optimize = jest.fn(async (file: File) => file);
jest.mock('@/lib/optimize-image', () => ({
  optimizeImage: (...a: unknown[]) => optimize(...(a as [File])),
}));

const EXPENSE = {
  id: 'e1',
  date: '2026-09-08',
  description: 'Sheet stock',
  amount: 11800,
  paymentType: 'UPI',
  doneBy: 'Nakul',
  toName: 'Verma Ply',
  vendor: 'Self',
  spentType: 'Raw material',
  note: 'Two sheets short',
  vendorGstin: '09AAACH7409R1ZZ',
  taxableValue: 10000,
  taxAmount: 1800,
  itcEligible: true,
  order: { id: 'o1', code: 'ORD-1', client: { name: 'Verma Interiors' } },
  createdBy: { id: 'u1', name: 'Nakul' },
};

beforeEach(() => {
  jest.clearAllMocks();
  query = new URLSearchParams();
  permissions = [PERMISSIONS.EXPENSE_VIEW, PERMISSIONS.EXPENSE_MANAGE];
  apiMock.expense.mockResolvedValue(EXPENSE);
  apiMock.history.mockResolvedValue([]);
  apiMock.deleteExpense.mockResolvedValue({ id: 'e1' });
  apiMock.attachExpenseBill.mockResolvedValue({ id: 'e1' });
  apiMock.removeExpenseBill.mockResolvedValue({ id: 'e1' });
  apiMock.expenseOptions.mockResolvedValue({
    PAYMENT_TYPE: ['UPI'],
    DONE_BY: ['Nakul'],
    VENDOR: ['Self'],
    SPENT_TYPE: ['Raw material'],
    TO_NAME: ['Verma Ply'],
  });
});

const mount = async (row: unknown = EXPENSE) => {
  apiMock.expense.mockResolvedValue(row);
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <ExpensePage params={Promise.resolve({ id: 'e1' })} />
      </Suspense>,
    );
  });
};

it('says what it was, who got it and how it was paid', async () => {
  await mount();
  expect(await screen.findByText('₹11,800')).toBeInTheDocument();
  expect(screen.getByText('UPI · paid to Verma Ply')).toBeInTheDocument();
  expect(screen.getByText('ORD-1 · Verma Interiors')).toBeInTheDocument();
});

it('shows the tax, and whether the credit can be claimed', async () => {
  await mount();
  // An expense whose tax can be claimed is a different number to the accountant.
  expect(await screen.findByText('Credit claimable')).toBeInTheDocument();
  expect(screen.getByText('09AAACH7409R1ZZ')).toBeInTheDocument();
});

it('leaves the tax card off a bill that had none', async () => {
  await mount({ ...EXPENSE, vendorGstin: null, taxAmount: null, taxableValue: null });
  await waitFor(() => expect(screen.queryByText('Tax on this bill')).toBeNull());
});

it('reads the trail from the same history everything else uses', async () => {
  await mount();
  await waitFor(() => expect(apiMock.history).toHaveBeenCalledWith('expenses', 'e1'));
});

it('offers editing and deleting only to somebody who may', async () => {
  permissions = [PERMISSIONS.EXPENSE_VIEW];
  await mount();
  await waitFor(() => expect(screen.queryByText('Delete')).toBeNull());
});

it('asks before deleting, and says the history keeps a record', async () => {
  await mount();
  fireEvent.click(await screen.findByText('Delete'));
  expect(await screen.findByText(/ledger entry/)).toBeInTheDocument();
  expect(apiMock.deleteExpense).not.toHaveBeenCalled();
});

it('deletes once that is confirmed', async () => {
  await mount();
  fireEvent.click(await screen.findByText('Delete'));
  fireEvent.click(await screen.findByText('Delete it'));
  await waitFor(() => expect(apiMock.deleteExpense).toHaveBeenCalledWith('e1'));
  expect(push).toHaveBeenCalledWith('/expenses');
});

it('edits on the same address rather than a page of its own', async () => {
  // A half-finished correction can then be shared, reloaded or backed out of.
  query = new URLSearchParams('edit=1');
  await mount();
  expect(await screen.findByText('Edit expense')).toBeInTheDocument();
});

describe('the bill', () => {
  it('offers to attach one when there is none', async () => {
    await mount();
    expect(await screen.findByLabelText('Attach a photo of the bill')).toBeInTheDocument();
  });

  it('optimises it as a size image, because a bill is read', async () => {
    await mount();
    const input = await screen.findByLabelText('Attach a photo of the bill');
    const file = new File(['x'], 'bill.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    // The harder reference-image compression turns a printed rate into a smudge.
    await waitFor(() => expect(optimize).toHaveBeenCalledWith(file, 'SIZE_IMAGE'));
    expect(apiMock.attachExpenseBill).toHaveBeenCalledWith('e1', file);
  });

  it('shows the bill once there is one, and offers to remove it', async () => {
    await mount({
      ...EXPENSE,
      bill: { id: 'f1', fileName: 'bill.webp', mimeType: 'image/webp', byteSize: 1000 },
    });
    expect(await screen.findByAltText('Bill for Sheet stock')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Remove'));
    await waitFor(() => expect(apiMock.removeExpenseBill).toHaveBeenCalledWith('e1'));
  });

  it('says plainly that there is none, to somebody who cannot add one', async () => {
    permissions = [PERMISSIONS.EXPENSE_VIEW];
    await mount();
    expect(await screen.findByText('No bill was attached.')).toBeInTheDocument();
  });
});
