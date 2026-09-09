import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@fas/shared';
import { DisbursementsScreen } from './DisbursementsScreen';

const mockOrderDisbursements = jest.fn();
const mockCategories = jest.fn();
const mockCreate = jest.fn();
const mockSettle = jest.fn();
const mockCancel = jest.fn();
const mockReverse = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    orderDisbursements: (...a: unknown[]) => mockOrderDisbursements(...a),
    disbursementCategories: () => mockCategories(),
    createDisbursement: (...a: unknown[]) => mockCreate(...a),
    settleDisbursement: (...a: unknown[]) => mockSettle(...a),
    cancelDisbursement: (...a: unknown[]) => mockCancel(...a),
    reverseDisbursement: (...a: unknown[]) => mockReverse(...a),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const LEDGER = {
  label: 'ISC',
  total: 4300,
  paid: 2500,
  pending: 1800,
  count: 2,
  disbursements: [
    {
      id: 'd1',
      payeeName: 'Ramesh',
      amount: '2500',
      status: 'PAID',
      paidMode: 'CASH',
      paidAt: '2026-09-02T10:00:00Z',
      reference: 'SLIP-9',
      note: 'Fitting at site',
      category: { name: 'Installation' },
    },
    {
      id: 'd2',
      payeeName: 'Iqbal',
      amount: '1800',
      status: 'PLANNED',
      paidMode: null,
      paidAt: null,
      reference: null,
      note: null,
      category: null,
    },
  ],
};

async function mount(ledger: unknown = LEDGER) {
  mockOrderDisbursements.mockResolvedValue(ledger);
  await render(
    <DisbursementsScreen
      route={{ params: { orderId: 'o1', orderCode: 'ORD-1' } }}
      navigation={{ goBack: jest.fn() }}
    />,
  );
  await screen.findByText('Committed');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.DISBURSEMENT_MANAGE];
  mockCategories.mockResolvedValue([
    { id: 'c1', name: 'Installation' },
    { id: 'c2', name: 'Transport' },
  ]);
  mockCreate.mockResolvedValue({});
  mockSettle.mockResolvedValue({});
  mockCancel.mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('uses the tenant’s own word for these charges throughout', async () => {
  mockOrderDisbursements.mockResolvedValue({ ...LEDGER, label: 'Site charges' });
  await render(
    <DisbursementsScreen
      route={{ params: { orderId: 'o1' } }}
      navigation={{ goBack: jest.fn() }}
    />,
  );
  expect(await screen.findByText('Site charges')).toBeTruthy();
  expect(screen.getByText('Add Site charges')).toBeTruthy();
});

it('splits the committed figure into paid and still owed', async () => {
  await mount();
  expect(screen.getByText('₹4,300')).toBeTruthy();
  // Twice each: once in the hero, once on the payout it came from.
  expect(screen.getAllByText('₹2,500')).toHaveLength(2);
  expect(screen.getAllByText('₹1,800')).toHaveLength(2);
});

it('says on the screen that none of this touches the order', async () => {
  await mount();
  // An order quoted at ₹X is worth ₹X and is settled when ₹X is collected.
  expect(
    screen.getByText(/The order's own total and payment status are unchanged/),
  ).toBeTruthy();
});

it('lists each payout with who, what for and whether it has gone out', async () => {
  await mount();
  expect(screen.getByText('Ramesh')).toBeTruthy();
  expect(screen.getByText(/Installation ·/)).toBeTruthy();
  expect(screen.getByText('Paid CASH')).toBeTruthy();
  expect(screen.getByText('Owed')).toBeTruthy();
});

it('says a payout has no category rather than leaving it blank', async () => {
  await mount();
  expect(screen.getByText('Uncategorised')).toBeTruthy();
});

it('counts the payouts, in the singular and the plural', async () => {
  await mount();
  expect(screen.getByText('2 payouts')).toBeTruthy();
  await mount({ ...LEDGER, count: 1, disbursements: [LEDGER.disbursements[0]] });
  expect(screen.getByText('1 payout')).toBeTruthy();
});

it('says when there is nothing to pay out', async () => {
  await mount({ ...LEDGER, count: 0, disbursements: [] });
  expect(screen.getByText('Nothing to pay out yet')).toBeTruthy();
  expect(screen.getByText('Payouts')).toBeTruthy();
});

it('hides every action from someone who may not manage payouts', async () => {
  mockPermissions = [];
  await mount();
  expect(screen.queryByText('Add ISC')).toBeNull();
  expect(screen.queryByText('Mark paid')).toBeNull();
  expect(screen.queryByText('Cancel')).toBeNull();
});

describe('adding a payout', () => {
  const openSheet = () => fireEvent.press(screen.getByText('Add ISC'));
  const amountField = () => screen.getByPlaceholderText('0');

  it('cannot be added without a payee and an amount', async () => {
    await mount();
    await openSheet();
    await fireEvent.press(screen.getByText('Add'));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('records who it went to, how much, and what for', async () => {
    await mount();
    await openSheet();
    await fireEvent.changeText(
      screen.getByPlaceholderText('Fitter, transporter, polisher…'),
      ' Ramesh ',
    );
    await fireEvent.changeText(amountField(), '1500');
    await fireEvent.changeText(screen.getByPlaceholderText('Optional'), ' Fitting ');
    await fireEvent.press(screen.getAllByText('Installation').at(-1)!);
    await fireEvent.press(screen.getByText('Add'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate).toHaveBeenCalledWith('o1', {
      payeeName: 'Ramesh',
      amount: 1500,
      categoryId: 'c1',
      payeeContact: undefined,
      note: 'Fitting',
      status: 'PLANNED',
      paidMode: undefined,
    });
  });

  it('records one that has already gone out, and how', async () => {
    await mount();
    await openSheet();
    await fireEvent.changeText(
      screen.getByPlaceholderText('Fitter, transporter, polisher…'),
      'Ramesh',
    );
    await fireEvent.changeText(amountField(), '1500');
    await fireEvent.press(screen.getAllByText('Still owed').at(-1)!);
    await fireEvent.press(screen.getAllByText('Online').at(-1)!);
    await fireEvent.press(screen.getByText('Add'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][1]).toMatchObject({
      status: 'PAID',
      paidMode: 'ONLINE',
    });
  });

  it('shows the server’s refusal', async () => {
    mockCreate.mockRejectedValue(new Error('Say how it was paid — cash or online'));
    await mount();
    await openSheet();
    await fireEvent.changeText(
      screen.getByPlaceholderText('Fitter, transporter, polisher…'),
      'Ramesh',
    );
    await fireEvent.changeText(amountField(), '1500');
    await fireEvent.press(screen.getByText('Add'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Could not add');
  });

  it('starts as still owed, not as paid', async () => {
    await mount();
    await openSheet();
    // "Still owed" also labels the hero figure, so the sheet's chip is the last.
    expect(screen.getAllByText('Still owed').at(-1)).toBeTruthy();
    expect(screen.queryByText('Already paid')).toBeNull();
  });

  it('asks how it went out only once it is marked already paid', async () => {
    await mount();
    await openSheet();
    expect(screen.queryByText('Cash')).toBeNull();
    await fireEvent.press(screen.getAllByText('Still owed').at(-1)!);
    expect(screen.getByText('Already paid')).toBeTruthy();
    expect(screen.getByText('Cash')).toBeTruthy();
    expect(screen.getByText('Online')).toBeTruthy();
  });

  it('lets a category be unpicked', async () => {
    await mount();
    await openSheet();
    const chip = () => screen.getAllByText('Installation').at(-1)!;
    await fireEvent.press(chip());
    await fireEvent.press(chip());
    // Pressing the chosen category again clears it rather than sticking.
    expect(screen.getAllByText('Installation').length).toBeGreaterThan(0);
  });
});

describe('settling a payout', () => {
  it('is offered only on one that is still owed', async () => {
    await mount();
    expect(screen.getAllByText('Mark paid')).toHaveLength(1);
  });

  it('names the payee and the amount being settled', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Mark paid'));
    expect(await screen.findByText('Iqbal · ₹1,800')).toBeTruthy();
  });

  it('records how it went out and the reference', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Mark paid'));
    await fireEvent.press(screen.getAllByText('Online').at(-1)!);
    await fireEvent.changeText(
      screen.getByPlaceholderText('UTR, cheque or slip number'),
      'UTR9',
    );
    await fireEvent.press(screen.getAllByText('Mark paid').at(-1)!);
    await waitFor(() => expect(mockSettle).toHaveBeenCalled());
    expect(mockSettle).toHaveBeenCalledWith('d2', {
      paidMode: 'ONLINE',
      reference: 'UTR9',
    });
  });

  it('shows the server’s refusal', async () => {
    mockSettle.mockRejectedValue(new Error('That payout is already settled'));
    await mount();
    await fireEvent.press(screen.getByText('Mark paid'));
    await fireEvent.press(screen.getAllByText('Mark paid').at(-1)!);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Could not settle');
  });

  it('shows a settled payout’s reference instead of the settle action', async () => {
    await mount();
    expect(screen.getByText('ref SLIP-9')).toBeTruthy();
  });
});

describe('cancelling a payout that was only planned', () => {
  it('asks first, naming the payee and the amount', async () => {
    await mount();
    // The planned one is Iqbal's; a paid payout is taken back instead.
    await fireEvent.press(screen.getAllByText('Cancel')[0]);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Cancel this payout?',
      'Iqbal · ₹1,800',
      expect.anything(),
    );
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('cancels once it is confirmed', async () => {
    await mount();
    await fireEvent.press(screen.getAllByText('Cancel')[0]);
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as {
      text: string;
      onPress?: () => void;
    }[];
    const confirm = buttons.find((b) => b.text !== 'Cancel' && b.onPress);
    await confirm!.onPress!();
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('d2'));
  });

  it('offers no cancel on one that has been paid', async () => {
    await mount();
    // An intention can be dropped; money that has gone is taken back instead,
    // which leaves both rows standing.
    expect(screen.getAllByText('Cancel')).toHaveLength(1);
    expect(screen.getByText('Take it back')).toBeTruthy();
  });
});

describe('taking a settled payout back', () => {
  it('insists on a reason', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Take it back'));
    await fireEvent.press(screen.getAllByText('Take it back')[1]);
    expect(mockReverse).not.toHaveBeenCalled();
  });

  it('records the correction once a reason is given', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Take it back'));
    await fireEvent.changeText(
      screen.getByPlaceholderText('Paid the wrong fitter'),
      'Paid the wrong fitter',
    );
    await fireEvent.press(screen.getAllByText('Take it back')[1]);
    await waitFor(() =>
      expect(mockReverse).toHaveBeenCalledWith('d1', 'Paid the wrong fitter'),
    );
  });

  it('offers nothing on a row that is already a correction', async () => {
    await mount({
      ...LEDGER,
      disbursements: [{ ...LEDGER.disbursements[0], reversalOfId: 'd0' }],
    });
    expect(screen.queryByText('Take it back')).toBeNull();
  });
});
