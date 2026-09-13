import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TransactionsPage from './page';

const apiMock = { cashPosition: jest.fn(), cashToBank: jest.fn(), transactions: jest.fn() };
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

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const POSITION = {
  cash: { received: 50000, deposited: 30000, paidOut: 0, notBanked: 20000, inHand: 20000 },
  online: { received: 25000 },
};

const ROW = {
  paymentId: 'p1',
  orderId: 'o1',
  orderCode: 'ORD-2627-0003',
  client: 'Verma Interiors',
  received: 20000,
  deposited: 0,
  notBanked: 20000,
};

const FEED = [
  {
    id: 'payment:p9',
    kind: 'PAYMENT_ONLINE',
    direction: 'IN',
    at: '2026-09-08T10:00:00Z',
    amount: 18000,
    reference: 'UTR9988',
    note: null,
    order: { id: 'o2', code: 'ORD-2', client: { name: 'Bhatia' } },
    by: { id: 'u1', name: 'Ravi' },
  },
  {
    id: 'deposit:d1',
    kind: 'BANK_DEPOSIT',
    direction: 'TRANSFER',
    at: '2026-09-07T10:00:00Z',
    amount: 20000,
    reference: 'HDFC-771',
    note: null,
    order: null,
    by: { id: 'u2', name: 'Nakul' },
  },
];

const page = (rows: unknown[]) => ({
  data: rows,
  meta: { page: 1, limit: 25, total: rows.length, pages: 1 },
});

async function mount(position: unknown = POSITION, rows: unknown[] = [ROW]) {
  apiMock.cashPosition.mockResolvedValue(position);
  apiMock.cashToBank.mockResolvedValue(rows);
  render(<TransactionsPage />);
  await screen.findByText('Transactions');
}

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.transactions.mockResolvedValue(page(FEED));
});

it('says it is counting rather than showing zeroes', async () => {
  apiMock.cashPosition.mockReturnValue(new Promise(() => {}));
  apiMock.cashToBank.mockResolvedValue([]);
  render(<TransactionsPage />);
  expect(await screen.findByText('Counting')).toBeInTheDocument();
});

it('leads with what is still in hand, which is the figure this screen exists for', async () => {
  await mount();
  // The one number that cannot be read off a bank statement.
  expect(screen.getByText('In hand')).toBeInTheDocument();
  expect(screen.getAllByText('₹20,000').length).toBeGreaterThan(0);
  expect(screen.getByText('₹50,000 taken in cash')).toBeInTheDocument();
});

it('adds cash and online together for what has been collected', async () => {
  await mount();
  expect(screen.getByText('₹75,000')).toBeInTheDocument();
});

it('separates what has been banked from what arrived online', async () => {
  await mount();
  expect(screen.getByText('₹30,000')).toBeInTheDocument();
  expect(screen.getByText('₹25,000')).toBeInTheDocument();
  expect(screen.getByText('already in bank')).toBeInTheDocument();
});

it('lists what is in hand order by order, so somebody can be asked', async () => {
  await mount();
  expect(screen.getByText('ORD-2627-0003')).toBeInTheDocument();
  expect(screen.getByText('Verma Interiors')).toBeInTheDocument();
});

it('opens the receipt behind a row', async () => {
  await mount();
  fireEvent.click(screen.getByText('ORD-2627-0003'));
  expect(push).toHaveBeenCalledWith('/orders/o1/payments');
});

it('says plainly when everything has been banked', async () => {
  await mount({ cash: { received: 50000, deposited: 50000, paidOut: 0, notBanked: 0, inHand: 0 }, online: { received: 0 } }, []);
  expect(screen.getByText('Nothing in hand')).toBeInTheDocument();
  expect(screen.getByText('Every rupee taken has been banked.')).toBeInTheDocument();
});

it('waits for the list without holding up the totals', async () => {
  apiMock.cashPosition.mockResolvedValue(POSITION);
  apiMock.cashToBank.mockReturnValue(new Promise(() => {}));
  render(<TransactionsPage />);
  await waitFor(() => expect(screen.getByText('In hand')).toBeInTheDocument());
  expect(screen.getByText('Nothing in hand')).toBeInTheDocument();
});

describe('the list of movements', () => {
  it('is what the screen is now for, and says how many there are', async () => {
    await mount();
    expect(await screen.findByText('2 movements')).toBeInTheDocument();
  });

  it('puts every kind in one list, whatever the source', async () => {
    await mount();
    // "What happened to the money" is a single question.
    expect(await screen.findByText('Online in')).toBeInTheDocument();
    // "Banked" twice: the pill on the row and the summary card above.
    expect(screen.getAllByText('Banked').length).toBeGreaterThan(0);
  });

  it('names the order, the reference and who recorded it', async () => {
    await mount();
    expect(await screen.findByText('ORD-2')).toBeInTheDocument();
    expect(screen.getByText('· Bhatia')).toBeInTheDocument();
    expect(screen.getByText('UTR9988')).toBeInTheDocument();
    expect(screen.getByText('Ravi')).toBeInTheDocument();
  });

  it('marks money arriving, and does not mark money merely moving', async () => {
    await mount();
    // Banking cash changes where the money is, not how much there is.
    expect(await screen.findByText('+₹18,000')).toBeInTheDocument();
    expect(screen.getAllByText('₹20,000').length).toBeGreaterThan(0);
  });

  it('opens the receipts behind a row that belongs to an order', async () => {
    await mount();
    fireEvent.click(await screen.findByText('ORD-2'));
    expect(push).toHaveBeenCalledWith('/orders/o2/payments');
  });

  it('leaves a trip to the bank alone, since it belongs to no one order', async () => {
    await mount();
    fireEvent.click(await screen.findByText('HDFC-771'));
    expect(push).not.toHaveBeenCalled();
  });

  it('says plainly when nothing has been recorded', async () => {
    apiMock.transactions.mockResolvedValue(page([]));
    await mount();
    expect(await screen.findByText('Nothing here')).toBeInTheDocument();
  });

  it('leaves payouts out of it — they have a ledger of their own', async () => {
    await mount();
    expect(
      screen.getByText('Every movement of money except payouts'),
    ).toBeInTheDocument();
  });
});

describe('filtering', () => {
  it('offers the kinds through the one filter component', async () => {
    await mount();
    fireEvent.click(screen.getByText('Filter'));
    expect(await screen.findByText('Filter movements')).toBeInTheDocument();
  });

  it('searches by order, client or reference', async () => {
    await mount();
    fireEvent.change(screen.getByPlaceholderText('Order, client or reference'), {
      target: { value: 'UTR99' },
    });
    await waitFor(() =>
      expect(apiMock.transactions).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'UTR99' }),
      ),
    );
  });

  it('asks the server for one kind, rather than filtering what it already has', async () => {
    await mount();
    fireEvent.click(screen.getByText('Filter'));
    await screen.findByText('Filter movements');
    fireEvent.click(screen.getByText('Show everything'));
    await waitFor(() => expect(apiMock.transactions).toHaveBeenCalled());
    // A page of 25 filtered in the browser would hide the rest of the ledger.
    expect(apiMock.transactions.mock.calls.at(-1)![0]).toMatchObject({ page: 1 });
  });
});

it('says where the cash went when some of it was paid out', async () => {
  // A payout leaves the drawer, so the drawer figure has to account for it —
  // and say so, rather than quietly showing a smaller number.
  await mount({
    cash: { received: 50000, deposited: 30000, paidOut: 5000, notBanked: 20000, inHand: 15000 },
    online: { received: 25000 },
  });
  expect(await screen.findByText('less ₹5,000 paid out in cash')).toBeInTheDocument();
});

it('keeps the payout line off a shop that has paid nothing out', async () => {
  await mount();
  expect(screen.queryByText(/paid out in cash/)).toBeNull();
});

/*
 * The shop's own trial found the drawer saying two things at once: the card
 * read "in hand −₹1,000" while the list below it read "still in hand ₹5,000".
 *
 * They answer different questions — what is in the drawer, and which receipts
 * have not been walked to the bank — and a payout separates them, because cash
 * handed to a fitter empties the drawer without banking anything. So they are
 * named differently now, and the screen prints the subtraction.
 */
describe('the drawer against the receipts waiting for the bank', () => {
  const short = {
    cash: { received: 20000, deposited: 15000, paidOut: 6000, notBanked: 5000, inHand: -1000 },
    online: { received: 0, receipts: 0 },
    deposits: 1,
  };

  it('names every movement that made the figure, banked included', async () => {
    // Without the banked line the words do not produce the number: ₹20,000
    // taken less ₹6,000 paid out is not −₹1,000.
    await mount(short, []);

    expect(screen.getByText('₹20,000 taken in cash')).toBeInTheDocument();
    expect(screen.getByText('less ₹15,000 banked')).toBeInTheDocument();
    expect(screen.getByText('less ₹6,000 paid out in cash')).toBeInTheDocument();
  });

  it('does not call the receipts waiting for the bank "in hand"', async () => {
    await mount();

    expect(screen.getByText('Taken in cash, not yet banked')).toBeInTheDocument();
    expect(screen.queryByText('Still in hand, order by order')).toBeNull();
  });

  it('shows the subtraction between the two', async () => {
    await mount(short, []);

    expect(screen.getByTestId('cash-reconcile')).toHaveTextContent(
      '₹5,000 still to bank, less ₹6,000 paid out in cash, leaves -₹1,000 in hand.',
    );
  });

  it('says plainly that a drawer below nothing is somebody’s mistake', async () => {
    await mount(short, []);

    expect(screen.getByTestId('cash-negative')).toBeInTheDocument();
  });

  it('keeps that warning off a drawer that is merely empty', async () => {
    await mount(
      {
        cash: { received: 20000, deposited: 20000, paidOut: 0, notBanked: 0, inHand: 0 },
        online: { received: 0, receipts: 0 },
        deposits: 1,
      },
      [],
    );

    expect(screen.queryByTestId('cash-negative')).toBeNull();
  });
});
