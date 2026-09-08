import { Suspense } from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@decor/shared';
import PaymentsPage from './page';

const apiMock = {
  paymentSummary: jest.fn(),
  recordPayment: jest.fn(),
  recordDeposit: jest.fn(),
};
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        (apiMock[key as keyof typeof apiMock] ?? jest.fn(async () => null))(...args),
    },
  ),
}));

let granted: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Nakul' },
    can: (permission: string) => granted.includes(permission),
  }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const payment = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  amount: '20000',
  mode: 'CASH',
  reference: null,
  receivedAt: '2026-09-06T10:30:00.000Z',
  receivedBy: { name: 'Sales Desk' },
  deposits: [],
  ...over,
});

const SUMMARY = {
  total: 100000,
  received: 20000,
  pending: 80000,
  receivedPct: 20,
  status: 'PARTIAL',
  cash: { received: 20000, deposited: 0, inHand: 20000 },
  online: { received: 0 },
  payments: [payment()],
};

/**
 * The page reads its route params with `use()`, which suspends until the
 * promise settles — so it needs a boundary the way the router gives it one.
 */
const open = async (summary?: unknown) => {
  if (summary !== undefined) apiMock.paymentSummary.mockResolvedValue(summary);
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <PaymentsPage params={Promise.resolve({ id: 'o1' })} />
      </Suspense>,
    );
  });
};

async function mount(summary: unknown = SUMMARY) {
  await open(summary);
  await screen.findByText('Payments');
}

const field = (label: string) =>
  Array.from(document.querySelectorAll('label.field'))
    .find((node) => node.querySelector('.field-label')?.textContent?.startsWith(label))!
    .querySelector('input, textarea') as HTMLInputElement;

beforeEach(() => {
  jest.clearAllMocks();
  granted = [PERMISSIONS.PAYMENT_RECORD, PERMISSIONS.CASH_DEPOSIT];
  apiMock.recordPayment.mockResolvedValue({});
  apiMock.recordDeposit.mockResolvedValue({});
});

it('says it is loading rather than showing an empty ledger', async () => {
  apiMock.paymentSummary.mockReturnValue(new Promise(() => {}));
  await open();
  expect(await screen.findByText('Loading payments')).toBeInTheDocument();
});

describe('what the order is owed', () => {
  it('leads with the whole value, not the balance', async () => {
    await mount();
    expect(screen.getByText('Client owes')).toBeInTheDocument();
    // A lakh and above reads in lakhs, which is how the shop says it.
    expect(screen.getByText('₹1,00,000')).toBeInTheDocument();
  });

  it('shows what has come in and what is still out', async () => {
    await mount();
    // ₹20,000 three times: received on the card, the cash total, and the
    // receipt itself.
    expect(screen.getAllByText('₹20,000')).toHaveLength(3);
    expect(screen.getByText('₹80,000')).toBeInTheDocument();
    expect(screen.getByText('20% collected')).toBeInTheDocument();
  });

  it('never fills the bar past full, however the server counted', async () => {
    await mount({ ...SUMMARY, receivedPct: 140 });
    const fill = document.querySelector('.track-fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('names the state the order is in', async () => {
    await mount();
    expect(screen.getByText('PARTIAL')).toBeInTheDocument();
  });
});

describe('cash and online', () => {
  it('separates the two, because only one of them needs banking', async () => {
    await mount();
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('already in bank')).toBeInTheDocument();
  });

  it('says how much cash is still in somebody’s pocket', async () => {
    await mount();
    // The question the shop actually has to answer later.
    expect(screen.getByText('₹20,000 in hand')).toBeInTheDocument();
  });

  it('says nothing about cash in hand when it has all been banked', async () => {
    await mount({
      ...SUMMARY,
      cash: { received: 20000, deposited: 20000, inHand: 0 },
    });
    expect(screen.queryByText(/in hand$/)).not.toBeInTheDocument();
  });
});

describe('the receipts', () => {
  it('says so when nothing has been collected', async () => {
    await mount({ ...SUMMARY, payments: [], received: 0, pending: 100000, receivedPct: 0 });
    expect(screen.getByText('Nothing collected yet')).toBeInTheDocument();
  });

  it('lists each receipt with how it arrived and who took it', async () => {
    await mount();
    expect(screen.getByText('CASH')).toBeInTheDocument();
    expect(screen.getByText(/Sales Desk/)).toBeInTheDocument();
  });

  it('shows the reference on an online receipt', async () => {
    await mount({
      ...SUMMARY,
      payments: [payment({ mode: 'ONLINE', reference: 'UTR9911' })],
    });
    expect(screen.getByText(/ref UTR9911/)).toBeInTheDocument();
  });

  it('shows how much of a cash receipt reached the bank', async () => {
    await mount({
      ...SUMMARY,
      payments: [payment({ deposits: [{ id: 'd1', amount: '5000' }] })],
    });
    expect(screen.getByText('banked ₹5,000 · in hand ₹15,000')).toBeInTheDocument();
  });

  it('asks nothing about banking an online receipt', async () => {
    await mount({ ...SUMMARY, payments: [payment({ mode: 'ONLINE' })] });
    expect(screen.queryByText('Bank it')).not.toBeInTheDocument();
  });

  it('offers to bank cash that is still in hand', async () => {
    await mount();
    expect(screen.getByText('Bank it')).toBeInTheDocument();
  });

  it('stops offering once a receipt is fully banked', async () => {
    await mount({
      ...SUMMARY,
      payments: [payment({ deposits: [{ id: 'd1', amount: '20000' }] })],
    });
    expect(screen.queryByText('Bank it')).not.toBeInTheDocument();
  });
});

describe('recording a payment', () => {
  it('is offered only to somebody allowed to take money', async () => {
    granted = [];
    await mount();
    expect(screen.queryByText('Record a payment')).not.toBeInTheDocument();
  });

  it('is not offered on an order that is already settled', async () => {
    await mount({ ...SUMMARY, pending: 0, received: 100000, receivedPct: 100, status: 'RECEIVED' });
    expect(screen.queryByText('Record a payment')).not.toBeInTheDocument();
  });

  it('says what is still owed while the amount is typed', async () => {
    await mount();
    fireEvent.click(screen.getByText('Record a payment'));
    expect(await screen.findByText('₹80,000 still owed')).toBeInTheDocument();
  });

  it('will not record nothing', async () => {
    await mount();
    fireEvent.click(screen.getByText('Record a payment'));
    fireEvent.click(await screen.findByText('Record'));
    expect(apiMock.recordPayment).not.toHaveBeenCalled();
  });

  it('records cash, and how much of it went straight to the bank', async () => {
    await mount();
    fireEvent.click(screen.getByText('Record a payment'));
    fireEvent.change(field('Amount'), { target: { value: '30000' } });
    fireEvent.change(field('Banked straight away'), { target: { value: '10000' } });
    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(apiMock.recordPayment).toHaveBeenCalled());
    expect(apiMock.recordPayment.mock.calls[0]).toEqual([
      'o1',
      { amount: 30000, mode: 'CASH', reference: undefined, depositedAmount: 10000 },
    ]);
  });

  it('leaves cash unbanked when nothing was said', async () => {
    await mount();
    fireEvent.click(screen.getByText('Record a payment'));
    fireEvent.change(field('Amount'), { target: { value: '30000' } });
    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(apiMock.recordPayment).toHaveBeenCalled());
    // Cash not banked shows as in hand until it is.
    expect(apiMock.recordPayment.mock.calls[0][1].depositedAmount).toBeUndefined();
  });

  it('asks for a reference on an online payment instead of a banking figure', async () => {
    await mount();
    fireEvent.click(screen.getByText('Record a payment'));
    // "Online" twice: the cash/online summary card, and the chip in the sheet.
    fireEvent.click((await screen.findAllByText('Online')).at(-1)!);
    expect(screen.getByPlaceholderText('UTR or cheque number')).toBeInTheDocument();
    fireEvent.change(field('Amount'), { target: { value: '30000' } });
    fireEvent.change(field('Reference'), { target: { value: 'UTR9911' } });
    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(apiMock.recordPayment).toHaveBeenCalled());
    expect(apiMock.recordPayment.mock.calls[0][1]).toEqual({
      amount: 30000,
      mode: 'ONLINE',
      reference: 'UTR9911',
      depositedAmount: undefined,
    });
  });

  it('never banks money on an online payment, whatever was typed before switching', async () => {
    await mount();
    fireEvent.click(screen.getByText('Record a payment'));
    fireEvent.change(field('Amount'), { target: { value: '30000' } });
    fireEvent.change(field('Banked straight away'), { target: { value: '10000' } });
    fireEvent.click(screen.getAllByText('Online').at(-1)!);
    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(apiMock.recordPayment).toHaveBeenCalled());
    // Online money is already in the bank; a deposit on top would double-count.
    expect(apiMock.recordPayment.mock.calls[0][1].depositedAmount).toBeUndefined();
  });

  it('re-reads the ledger afterwards rather than guessing the new total', async () => {
    await mount();
    fireEvent.click(screen.getByText('Record a payment'));
    fireEvent.change(field('Amount'), { target: { value: '30000' } });
    fireEvent.click(screen.getByText('Record'));
    await waitFor(() => expect(apiMock.paymentSummary).toHaveBeenCalledTimes(2));
  });

  it('keeps the sheet open and says why when the server refuses', async () => {
    apiMock.recordPayment.mockRejectedValue(new Error('More than the order is worth'));
    await mount();
    fireEvent.click(screen.getByText('Record a payment'));
    fireEvent.change(field('Amount'), { target: { value: '900000' } });
    fireEvent.click(screen.getByText('Record'));
    expect(await screen.findByText('More than the order is worth')).toBeInTheDocument();
    expect(field('Amount')).toHaveValue('900000');
  });
});

describe('banking cash that was collected', () => {
  it('is offered only to somebody allowed to bank it', async () => {
    granted = [PERMISSIONS.PAYMENT_RECORD];
    await mount();
    expect(screen.queryByText('Bank it')).not.toBeInTheDocument();
  });

  it('offers the whole amount still in hand, which is the usual case', async () => {
    await mount();
    fireEvent.click(screen.getByText('Bank it'));
    await waitFor(() => expect(screen.getByText('Bank this cash')).toBeInTheDocument());
    expect(field('Amount')).toHaveValue('20000');
  });

  it('records the deposit against that receipt', async () => {
    await mount();
    fireEvent.click(screen.getByText('Bank it'));
    fireEvent.click(await screen.findByText('Record deposit'));
    await waitFor(() => expect(apiMock.recordDeposit).toHaveBeenCalled());
    expect(apiMock.recordDeposit.mock.calls[0][0]).toEqual({ paymentId: 'p1', amount: 20000 });
  });

  it('banks less than the whole when only part of it went in', async () => {
    await mount();
    fireEvent.click(screen.getByText('Bank it'));
    await screen.findByText('Bank this cash');
    fireEvent.change(field('Amount'), { target: { value: '5000' } });
    fireEvent.click(screen.getByText('Record deposit'));
    await waitFor(() => expect(apiMock.recordDeposit).toHaveBeenCalled());
    expect(apiMock.recordDeposit.mock.calls[0][0].amount).toBe(5000);
  });

  it('says why a deposit was refused', async () => {
    apiMock.recordDeposit.mockRejectedValue(new Error('More than was collected'));
    await mount();
    fireEvent.click(screen.getByText('Bank it'));
    fireEvent.click(await screen.findByText('Record deposit'));
    expect(await screen.findByText('More than was collected')).toBeInTheDocument();
  });
});
