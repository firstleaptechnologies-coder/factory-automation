import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@decor/shared';
import { PaymentsScreen } from './PaymentsScreen';

const mockPaymentSummary = jest.fn();
const mockRecordPayment = jest.fn();
const mockRecordDeposit = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    paymentSummary: (...args: unknown[]) => mockPaymentSummary(...args),
    recordPayment: (...args: unknown[]) => mockRecordPayment(...args),
    recordDeposit: (...args: unknown[]) => mockRecordDeposit(...args),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const SUMMARY = {
  total: 47200,
  received: 20000,
  pending: 27200,
  receivedPct: 42.37,
  status: 'PARTIAL',
  cash: { received: 12000, deposited: 8000, inHand: 4000 },
  online: { received: 8000 },
  payments: [
    {
      id: 'p1',
      amount: '12000',
      mode: 'CASH',
      receivedAt: '2026-09-01T10:00:00Z',
      receivedBy: { name: 'Ravi' },
      reference: null,
      deposits: [{ amount: '8000' }],
    },
    {
      id: 'p2',
      amount: '8000',
      mode: 'ONLINE',
      receivedAt: '2026-09-03T10:00:00Z',
      receivedBy: null,
      reference: 'UTR123',
      deposits: [],
    },
  ],
};

const goBack = jest.fn();

async function mount(summary: unknown = SUMMARY) {
  mockPaymentSummary.mockResolvedValue(summary);
  await render(
    <PaymentsScreen
      route={{ params: { orderId: 'o1', orderCode: 'ORD-1' } }}
      navigation={{ goBack }}
    />,
  );
  await screen.findByText('Payments');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.PAYMENT_RECORD, PERMISSIONS.CASH_DEPOSIT];
  mockRecordPayment.mockResolvedValue({});
  mockRecordDeposit.mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('says what the client owes, what has come in and what is left', async () => {
  await mount();
  expect(screen.getByText('₹47,200')).toBeTruthy();
  expect(screen.getByText('₹20,000')).toBeTruthy();
  expect(screen.getByText('₹27,200')).toBeTruthy();
});

it('splits collections by how the money arrived', async () => {
  await mount();
  expect(screen.getByText('banked ₹8,000')).toBeTruthy();
  expect(screen.getByText('already in bank')).toBeTruthy();
});

it('calls out cash that has not reached the bank', async () => {
  await mount();
  // The question the shop actually has to answer later.
  expect(screen.getByText('₹4,000 in hand')).toBeTruthy();
});

it('says nothing about cash in hand when it is all banked', async () => {
  await mount({ ...SUMMARY, cash: { received: 12000, deposited: 12000, inHand: 0 } });
  expect(screen.queryByText(/in hand$/)).toBeNull();
});

it('lists every receipt with how and when it arrived', async () => {
  await mount();
  expect(screen.getAllByText('₹12,000').length).toBeGreaterThan(0);
  expect(screen.getByText('CASH')).toBeTruthy();
  expect(screen.getByText('ONLINE')).toBeTruthy();
  expect(screen.getByText('ref UTR123')).toBeTruthy();
});

it('says who took the money when that was recorded', async () => {
  await mount();
  expect(screen.getByText(/· Ravi/)).toBeTruthy();
});

it('says nothing has been collected on a fresh order', async () => {
  await mount({ ...SUMMARY, payments: [] });
  expect(screen.getByText('Nothing collected yet')).toBeTruthy();
});

describe('recording a payment', () => {
  const openSheet = () => fireEvent.press(screen.getByText('Record a payment'));

  it('is offered only to someone allowed to record one', async () => {
    mockPermissions = [];
    await mount();
    expect(screen.queryByText('Record a payment')).toBeNull();
  });

  it('is not offered once the order is settled', async () => {
    await mount({ ...SUMMARY, pending: 0, status: 'RECEIVED' });
    expect(screen.queryByText('Record a payment')).toBeNull();
  });

  it('says how much is still owed', async () => {
    await mount();
    await openSheet();
    expect(screen.getByText('₹27,200 still owed')).toBeTruthy();
  });

  it('cannot be submitted empty or with nothing in it', async () => {
    await mount();
    await openSheet();
    expect(screen.getByText('Record').parent?.props.accessibilityState?.disabled ?? true).toBe(
      true,
    );
  });

  it('records what was collected, and how', async () => {
    await mount();
    await openSheet();
    await fireEvent.changeText(screen.getByPlaceholderText('27200'), '5000');
    await fireEvent.press(screen.getByText('Record'));
    await waitFor(() => expect(mockRecordPayment).toHaveBeenCalled());
    expect(mockRecordPayment).toHaveBeenCalledWith('o1', {
      amount: 5000,
      mode: 'CASH',
      reference: undefined,
      depositedAmount: undefined,
    });
  });

  it('records cash banked on the spot alongside it', async () => {
    await mount();
    await openSheet();
    await fireEvent.changeText(screen.getByPlaceholderText('27200'), '5000');
    await fireEvent.changeText(
      screen.getByPlaceholderText('Leave empty if it stayed in hand'),
      '3000',
    );
    await fireEvent.press(screen.getByText('Record'));
    await waitFor(() => expect(mockRecordPayment).toHaveBeenCalled());
    expect(mockRecordPayment.mock.calls[0][1].depositedAmount).toBe(3000);
  });

  it('asks for a reference instead of a deposit for an online payment', async () => {
    await mount();
    await openSheet();
    await fireEvent.press(screen.getAllByText('Online').at(-1)!);
    expect(screen.getByPlaceholderText('UTR or cheque number')).toBeTruthy();
    // Online money is already in the bank; there is nothing to deposit.
    expect(screen.queryByPlaceholderText('Leave empty if it stayed in hand')).toBeNull();
  });

  it('sends the reference on an online payment', async () => {
    await mount();
    await openSheet();
    await fireEvent.press(screen.getAllByText('Online').at(-1)!);
    await fireEvent.changeText(screen.getByPlaceholderText('27200'), '5000');
    await fireEvent.changeText(screen.getByPlaceholderText('UTR or cheque number'), 'UTR9');
    await fireEvent.press(screen.getByText('Record'));
    await waitFor(() => expect(mockRecordPayment).toHaveBeenCalled());
    expect(mockRecordPayment.mock.calls[0][1]).toMatchObject({
      mode: 'ONLINE',
      reference: 'UTR9',
      depositedAmount: undefined,
    });
  });

  it('shows the server’s refusal rather than pretending it worked', async () => {
    mockRecordPayment.mockRejectedValue(
      new Error('That is ₹500 more than the ₹27,200 still owed'),
    );
    await mount();
    await openSheet();
    await fireEvent.changeText(screen.getByPlaceholderText('27200'), '27700');
    await fireEvent.press(screen.getByText('Record'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toMatch(/more than/);
  });
});

describe('banking cash', () => {
  it('offers to bank a receipt that still has cash in hand', async () => {
    await mount();
    expect(screen.getByText('Bank it')).toBeTruthy();
  });

  it('does not offer it on an online receipt', async () => {
    await mount({ ...SUMMARY, payments: [SUMMARY.payments[1]] });
    expect(screen.queryByText('Bank it')).toBeNull();
  });

  it('does not offer it to someone who may not deposit', async () => {
    mockPermissions = [PERMISSIONS.PAYMENT_RECORD];
    await mount();
    expect(screen.queryByText('Bank it')).toBeNull();
  });

  it('does not offer it once the receipt is fully banked', async () => {
    await mount({
      ...SUMMARY,
      payments: [{ ...SUMMARY.payments[0], deposits: [{ amount: '12000' }] }],
    });
    expect(screen.queryByText('Bank it')).toBeNull();
  });

  it('starts from what is actually still in hand', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Bank it'));
    expect(screen.getByDisplayValue('4000')).toBeTruthy();
  });

  it('attaches the deposit to the receipt it came from', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Bank it'));
    await fireEvent.press(await screen.findByText('Record deposit'));
    await waitFor(() => expect(mockRecordDeposit).toHaveBeenCalled());
    expect(mockRecordDeposit.mock.calls[0][0]).toMatchObject({
      paymentId: 'p1',
      amount: 4000,
    });
  });

  it('shows the server’s refusal', async () => {
    mockRecordDeposit.mockRejectedValue(new Error('Only ₹4,000 is still in hand'));
    await mount();
    await fireEvent.press(screen.getByText('Bank it'));
    await fireEvent.press(await screen.findByText('Record deposit'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  });
});
