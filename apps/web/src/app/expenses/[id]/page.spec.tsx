import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { PERMISSIONS } from '@decor/shared';
import ExpensePage from './page';

const apiMock = {
  expense: jest.fn(),
  history: jest.fn(),
  expenseOptions: jest.fn(),
  attachExpenseBill: jest.fn(),
  removeExpenseBill: jest.fn(),
  reverseExpense: jest.fn(),
  expenseEdits: jest.fn(),
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
  apiMock.reverseExpense.mockResolvedValue({ id: 'e2' });
  apiMock.expenseEdits.mockResolvedValue([]);
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

it('offers editing and correcting only to somebody who may', async () => {
  permissions = [PERMISSIONS.EXPENSE_VIEW];
  await mount();
  await waitFor(() => expect(screen.queryByText('Take it back')).toBeNull());
  expect(screen.queryByText('Edit')).toBeNull();
});

describe('taking it back', () => {
  it('offers no delete at all', async () => {
    await mount();
    // Money that moved is never quietly unmoved.
    expect(screen.queryByText('Delete')).toBeNull();
    expect(await screen.findByText('Take it back')).toBeInTheDocument();
  });

  it('insists on a reason before it will', async () => {
    await mount();
    fireEvent.click(await screen.findByText('Take it back'));
    const confirm = screen.getAllByRole('button', { name: 'Take it back' })[1];
    expect(confirm).toBeDisabled();
    expect(apiMock.reverseExpense).not.toHaveBeenCalled();
  });

  it('records the correction once a reason is given', async () => {
    await mount();
    fireEvent.click(await screen.findByText('Take it back'));
    fireEvent.change(await screen.findByLabelText('Why'), {
      target: { value: 'Bill was for two sheets' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Take it back' })[1]);
    await waitFor(() =>
      expect(apiMock.reverseExpense).toHaveBeenCalledWith('e1', 'Bill was for two sheets'),
    );
  });

  it('says so on an expense that has been taken back, and offers no edit', async () => {
    await mount({ ...EXPENSE, reversedBy: { id: 'e2' } });
    expect(await screen.findByText('This was taken back')).toBeInTheDocument();
    expect(screen.queryByText('Edit')).toBeNull();
  });

  it('says so on the correction itself, with the reason', async () => {
    await mount({ ...EXPENSE, reversalOfId: 'e0', reason: 'Bill was for two sheets' });
    expect(await screen.findByText('This is a correction')).toBeInTheDocument();
    expect(screen.getByText('“Bill was for two sheets”')).toBeInTheDocument();
  });
});

describe('the story it keeps', () => {
  it('reads what changed and why somebody changed it', async () => {
    apiMock.expenseEdits.mockResolvedValue([
      {
        id: 'h1',
        editType: 'UPDATED',
        changes: [{ field: 'amount', from: 4500, to: 5200 }],
        note: 'Bill was for two sheets',
        userName: 'Nakul',
        createdAt: '2026-09-09T10:00:00Z',
      },
    ]);
    await mount();
    expect(await screen.findByText('Amount changed')).toBeInTheDocument();
    // The sentence somebody typed belongs beside the fields it explains.
    expect(screen.getByText('“Bill was for two sheets”')).toBeInTheDocument();
  });

  it('still shows the audit trail beside it', async () => {
    await mount();
    expect(await screen.findByText('Audit trail')).toBeInTheDocument();
    await waitFor(() => expect(apiMock.history).toHaveBeenCalledWith('expenses', 'e1'));
  });
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
