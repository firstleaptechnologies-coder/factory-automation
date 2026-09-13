import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TransactionsScreen } from './TransactionsScreen';

const mockCashPosition = jest.fn();
const mockCashToBank = jest.fn();
const mockRecordDeposit = jest.fn();
const mockTransactions = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    cashPosition: () => mockCashPosition(),
    cashToBank: () => mockCashToBank(),
    transactions: (...a: unknown[]) => mockTransactions(...a),
    recordDeposit: (...a: unknown[]) => mockRecordDeposit(...a),
  },
}));

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

const POSITION = {
  cash: { received: 30000, deposited: 18000, paidOut: 0, notBanked: 12000, inHand: 12000 },
  online: { received: 45000, receipts: 3 },
  deposits: 2,
};

const TO_BANK = [
  {
    paymentId: 'p1',
    client: 'Verma Interiors',
    orderCode: 'ORD-1',
    receivedAt: '2026-09-02T10:00:00Z',
    received: 12000,
    deposited: 8000,
    notBanked: 4000,
  },
];

async function mount(position: unknown = POSITION, toBank: unknown = TO_BANK) {
  mockCashPosition.mockResolvedValue(position);
  mockCashToBank.mockResolvedValue(toBank);
  await render(<TransactionsScreen navigation={{ goBack: jest.fn() }} />);
  await screen.findByText('In hand');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTransactions.mockResolvedValue({
    data: FEED,
    meta: { page: 1, limit: 25, total: FEED.length, pages: 1 },
  });
  mockRecordDeposit.mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('leads with the cash that has not reached the bank', async () => {
  await mount();
  // The one figure the shop has to answer for at the end of the week.
  expect(screen.getByText('₹12,000')).toBeTruthy();
  expect(screen.getByText('₹30,000 taken in cash')).toBeTruthy();
});

it('separates what is banked from what came in online', async () => {
  await mount();
  expect(screen.getByText('₹18,000')).toBeTruthy();
  expect(screen.getByText('2 deposits')).toBeTruthy();
  expect(screen.getByText('₹45,000')).toBeTruthy();
  expect(screen.getByText('3 receipts')).toBeTruthy();
});

it('breaks the cash down order by order, so it can be chased', async () => {
  await mount();
  expect(screen.getByText('Verma Interiors')).toBeTruthy();
  expect(screen.getByText(/ORD-1 ·/)).toBeTruthy();
  expect(screen.getByText('took ₹12,000 · banked ₹8,000')).toBeTruthy();
  expect(screen.getByText('₹4,000')).toBeTruthy();
});

it('says so plainly when every rupee is banked', async () => {
  await mount(POSITION, []);
  expect(screen.getByText('Nothing outstanding')).toBeTruthy();
  expect(screen.getByText('Every rupee is banked.')).toBeTruthy();
});

it('starts a deposit from what is actually still in hand on that receipt', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Bank it'));
  expect(await screen.findByDisplayValue('4000')).toBeTruthy();
});

it('attaches the deposit to the receipt the cash came from', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Bank it'));
  await fireEvent.changeText(
    screen.getByPlaceholderText('Deposit slip number'),
    'SLIP-9',
  );
  await fireEvent.press(await screen.findByText('Record deposit'));
  await waitFor(() => expect(mockRecordDeposit).toHaveBeenCalled());
  expect(mockRecordDeposit).toHaveBeenCalledWith({
    paymentId: 'p1',
    amount: 4000,
    bankReference: 'SLIP-9',
  });
});

it('sends no reference rather than an empty one', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Bank it'));
  await fireEvent.press(await screen.findByText('Record deposit'));
  await waitFor(() => expect(mockRecordDeposit).toHaveBeenCalled());
  expect(mockRecordDeposit.mock.calls[0][0].bankReference).toBeUndefined();
});

it('shows the server’s refusal when more is banked than is held', async () => {
  mockRecordDeposit.mockRejectedValue(new Error('Only ₹4,000 is still in hand'));
  await mount();
  await fireEvent.press(screen.getByText('Bank it'));
  await fireEvent.press(await screen.findByText('Record deposit'));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect((Alert.alert as jest.Mock).mock.calls[0][1]).toMatch(/still in hand/);
});

it('re-reads both figures after a deposit, so neither goes stale', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Bank it'));
  await fireEvent.press(await screen.findByText('Record deposit'));
  await waitFor(() => expect(mockCashPosition).toHaveBeenCalledTimes(2));
  expect(mockCashToBank).toHaveBeenCalledTimes(2);
});

describe('the list of movements', () => {
  it('is what the screen is now for, and says how many there are', async () => {
    await mount();
    expect(await screen.findByText('2 movements')).toBeTruthy();
  });

  it('puts every kind in one list, whatever the source', async () => {
    await mount();
    // "What happened to the money" is a single question.
    expect(await screen.findByText('Bhatia')).toBeTruthy();
    expect(screen.getByText('Cash to the bank')).toBeTruthy();
  });

  it('names the order and the reference a row came from', async () => {
    await mount();
    expect(await screen.findByText(/ORD-2/)).toBeTruthy();
    expect(screen.getByText('UTR9988')).toBeTruthy();
  });

  it('marks money arriving, and does not mark money merely moving', async () => {
    await mount();
    // Banking cash changes where the money is, not how much there is.
    expect(await screen.findByText('+₹18,000')).toBeTruthy();
    expect(screen.getByText('₹20,000')).toBeTruthy();
  });

  it('says plainly when nothing has been recorded', async () => {
    mockTransactions.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 25, total: 0, pages: 1 },
    });
    await mount();
    expect(await screen.findByText('Nothing here')).toBeTruthy();
  });

  it('leaves payouts out of it', async () => {
    await mount();
    // They have a ledger of their own; folding them in here would net them
    // off against the takings.
    // The subtitle says so; nothing in the list itself is one.
    expect(screen.getByText('Every movement of money except payouts')).toBeTruthy();
    expect(mockTransactions).toHaveBeenCalled();
  });
});

describe('filtering', () => {
  it('offers the kinds through the one filter component', async () => {
    await mount();
    await fireEvent.press(screen.getByLabelText('Filter'));
    // A wheel per dimension, applied in one go — never a loose row of chips.
    expect(await screen.findByText('Filter movements')).toBeTruthy();
    expect(screen.getAllByText('Cash in').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Banked').length).toBeGreaterThan(0);
  });

  it('filters nothing until it is applied', async () => {
    await mount();
    const before = mockTransactions.mock.calls.length;
    await fireEvent.press(screen.getByLabelText('Filter'));
    // The list must not thrash and re-fetch while somebody is still deciding.
    expect(mockTransactions.mock.calls.length).toBe(before);
  });

  it('asks the server for the kind that was applied', async () => {
    await mount();
    await fireEvent.press(screen.getByLabelText('Filter'));
    await fireEvent.press(await screen.findByText('Show everything'));
    await waitFor(() => expect(mockTransactions).toHaveBeenCalled());
    expect(mockTransactions.mock.calls.at(-1)![0]).toMatchObject({ kind: undefined });
  });

  it('searches by order, client or reference', async () => {
    await mount();
    await fireEvent.changeText(
      screen.getByPlaceholderText('Order, client or reference'),
      'UTR99',
    );
    await waitFor(() =>
      expect(mockTransactions).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'UTR99' }),
      ),
    );
  });

  it('says where the cash went when some of it was paid out', async () => {
    // A payout leaves the drawer, so the drawer figure has to account for it —
    // and say so, rather than quietly showing a smaller number.
    await mount({
      cash: { received: 30000, deposited: 18000, paidOut: 4000, notBanked: 12000, inHand: 8000 },
      online: { received: 45000, receipts: 3 },
      deposits: 2,
    });
    expect(await screen.findByText('less ₹4,000 paid out in cash')).toBeTruthy();
  });

  it('keeps the payout line off a shop that has paid nothing out', async () => {
    await mount();
    expect(screen.queryByText(/paid out in cash/)).toBeNull();
  });

  /*
   * The shop's own trial found the drawer saying two things at once: this card
   * read "in hand ₹-1,000" while the list below it read "still in hand
   * ₹5,000". The two answer different questions and a payout separates them,
   * so the screen now names them differently and prints the subtraction.
   */
  it('names every movement that made the figure, banked included', async () => {
    // ₹20,000 taken, ₹15,000 banked, ₹6,000 paid out. Without the banked line
    // the words under the number do not produce it.
    await mount({
      cash: { received: 20000, deposited: 15000, paidOut: 6000, notBanked: 5000, inHand: -1000 },
      online: { received: 0, receipts: 0 },
      deposits: 1,
    });

    expect(await screen.findByText('₹20,000 taken in cash')).toBeTruthy();
    expect(screen.getByText('less ₹15,000 banked')).toBeTruthy();
    expect(screen.getByText('less ₹6,000 paid out in cash')).toBeTruthy();
  });

  it('does not call the receipts waiting for the bank "in hand"', async () => {
    await mount();

    // One screen, one meaning for the words.
    expect(screen.getByText('Taken in cash, not yet banked')).toBeTruthy();
    expect(screen.queryByText('Still in hand, order by order')).toBeNull();
  });

  it('shows the subtraction between the two, so neither has to be guessed at', async () => {
    await mount({
      cash: { received: 20000, deposited: 15000, paidOut: 6000, notBanked: 5000, inHand: -1000 },
      online: { received: 0, receipts: 0 },
      deposits: 1,
    });

    expect(await screen.findByTestId('cash-reconcile')).toHaveTextContent(
      '₹5,000 still to bank, less ₹6,000 paid out in cash, leaves -₹1,000 in hand.',
    );
  });

  it('says plainly that a drawer below nothing is somebody’s mistake', async () => {
    await mount({
      cash: { received: 20000, deposited: 15000, paidOut: 6000, notBanked: 5000, inHand: -1000 },
      online: { received: 0, receipts: 0 },
      deposits: 1,
    });

    expect(await screen.findByTestId('cash-negative')).toBeTruthy();
  });

  it('keeps that warning off a drawer that is merely empty', async () => {
    await mount({
      cash: { received: 20000, deposited: 20000, paidOut: 0, notBanked: 0, inHand: 0 },
      online: { received: 0, receipts: 0 },
      deposits: 1,
    });

    expect(screen.queryByTestId('cash-negative')).toBeNull();
  });
});
