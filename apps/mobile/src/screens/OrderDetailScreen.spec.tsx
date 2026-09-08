import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@decor/shared';
import { OrderDetailScreen } from './OrderDetailScreen';

const mockOrder = jest.fn();
const mockAllowedNext = jest.fn();
const mockAllowedBack = jest.fn();
const mockChangeStatus = jest.fn();
const mockReprice = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    order: (...a: unknown[]) => mockOrder(...a),
    allowedNext: (...a: unknown[]) => mockAllowedNext(...a),
    allowedBack: (...a: unknown[]) => mockAllowedBack(...a),
    changeOrderStatus: (...a: unknown[]) => mockChangeStatus(...a),
    repriceOrder: (...a: unknown[]) => mockReprice(...a),
    fileUrl: (id: string) => `https://api.test/files/${id}`,
    getToken: () => 'tok',
  },
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const ORDER = {
  id: 'o1',
  code: 'ORD-2627-0002',
  createdAt: '2026-09-06T10:00:00Z',
  location: 'Andheri West',
  client: { name: 'Verma Interiors', phone: '9820012345' },
  status: { id: 's1', name: 'Cutting', color: '#FF6B1A' },
  paymentStatus: 'PARTIAL',
  taxTreatment: 'EXCLUSIVE',
  total: 40000,
  taxAmount: 7200,
  grandTotal: 47200,
  taxDiscount: 0,
  items: [
    {
      id: 'i1',
      quantity: 2,
      rate: 100,
      rateUnit: 'PER_SQFT',
      amount: 1000,
      taxAmount: 180,
      material: { name: 'MDF', color: '#B98B54' },
      display: { length: 8, width: 4, unit: 'FT', thickness: 18, thicknessUnit: 'MM' },
    },
  ],
  attachments: [],
  statusHistory: [
    {
      id: 'h1',
      changedAt: '2026-09-06T10:00:00Z',
      toStatus: { name: 'Cutting', color: '#FF6B1A' },
      fromStatus: null,
      note: 'Order punched',
      changedBy: { name: 'Ravi' },
    },
  ],
};

const navigate = jest.fn();
const goBack = jest.fn();

async function mount(order: Record<string, unknown> = {}, params: Record<string, unknown> = {}) {
  mockOrder.mockResolvedValue({ ...ORDER, ...order });
  await render(
    <OrderDetailScreen
      route={{ params: { orderId: 'o1', ...params } }}
      navigation={{ navigate, goBack }}
    />,
  );
  await screen.findAllByText('ORD-2627-0002');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [
    PERMISSIONS.ORDER_TERMS,
    PERMISSIONS.DISBURSEMENT_VIEW,
    PERMISSIONS.PAYMENT_VIEW,
  ];
  mockAllowedBack.mockResolvedValue([]);
  mockAllowedNext.mockResolvedValue([
    { id: 't1', toStatusId: 's2', requiresNote: false, label: null, toStatus: { name: 'Polishing', color: '#2EA043' } },
    { id: 't2', toStatusId: 's9', requiresNote: true, label: 'Put on hold', toStatus: { name: 'On hold', color: '#D29922' } },
  ]);
  mockChangeStatus.mockResolvedValue({});
  mockReprice.mockResolvedValue({});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it('shows the order, its client and where it is', async () => {
  await mount();
  expect(screen.getByText('Verma Interiors')).toBeTruthy();
  expect(screen.getByText('Andheri West')).toBeTruthy();
  expect(screen.getAllByText('Cutting').length).toBeGreaterThan(0);
});

it('congratulates a freshly punched order, and not any other', async () => {
  await mount({}, { justPunched: true });
  expect(screen.getByText('Punched — it is on the board now')).toBeTruthy();
  await mount();
  expect(screen.queryByText('Punched — it is on the board now')).toBeNull();
});

it('splits the money into taxable, GST and what the client pays', async () => {
  await mount();
  expect(screen.getByText('₹40,000')).toBeTruthy();
  expect(screen.getByText('₹7,200')).toBeTruthy();
  expect(screen.getByText('₹47,200')).toBeTruthy();
  expect(screen.getByText('PARTIAL')).toBeTruthy();
});

it('says nothing about money on an order that has none', async () => {
  await mount({ grandTotal: 0 });
  expect(screen.queryByText('Money')).toBeNull();
  expect(screen.queryByText('GST treatment')).toBeNull();
  expect(screen.queryByText('Payouts')).toBeNull();
});

it('opens the payments ledger', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Money'));
  expect(navigate).toHaveBeenCalledWith('Payments', {
    orderId: 'o1',
    orderCode: 'ORD-2627-0002',
  });
});

it('shows the totals but no way in to somebody who may not see the money', async () => {
  mockPermissions = [PERMISSIONS.ORDER_TERMS];
  await mount();
  // Production sees no money, and the API refuses them the ledger.
  expect(screen.getByText('Money')).toBeTruthy();
  await fireEvent.press(screen.getByText('Money'));
  expect(navigate).not.toHaveBeenCalledWith('Payments', expect.anything());
});

it('opens the payouts ledger, and says it is kept apart from the order', async () => {
  await mount();
  expect(
    screen.getByText('What this order owes other people. Kept separate from the order total.'),
  ).toBeTruthy();
  await fireEvent.press(screen.getByText('Payouts'));
  expect(navigate).toHaveBeenCalledWith('Disbursements', {
    orderId: 'o1',
    orderCode: 'ORD-2627-0002',
  });
});

it('hides the payouts ledger from someone who may not see it', async () => {
  mockPermissions = [PERMISSIONS.ORDER_TERMS];
  await mount();
  expect(screen.queryByText('Payouts')).toBeNull();
});

it('hides the GST treatment from someone who may not change terms', async () => {
  mockPermissions = [PERMISSIONS.DISBURSEMENT_VIEW];
  await mount();
  expect(screen.queryByText('GST treatment')).toBeNull();
});

it('names what was absorbed when the shop carried the tax', async () => {
  await mount({ taxTreatment: 'ABSORBED', taxDiscount: 7200 });
  expect(screen.getByText(/₹7,200 absorbed/)).toBeTruthy();
});

describe('moving the order', () => {
  it('offers exactly the moves the admin drew, and nothing else', async () => {
    await mount();
    await waitFor(() => expect(mockAllowedNext).toHaveBeenCalledWith('s1'));
    await fireEvent.press(screen.getByText('Move status'));
    expect(await screen.findByText('Move to Polishing')).toBeTruthy();
    expect(screen.getByText('Put on hold')).toBeTruthy();
  });

  it('says plainly when the flow allows nothing from here', async () => {
    mockAllowedNext.mockResolvedValue([]);
    await mount();
    expect(
      await screen.findByText(/No moves are allowed from Cutting/),
    ).toBeTruthy();
  });

  it('moves straight away when the edge needs no note', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Move status'));
    await fireEvent.press(await screen.findByText('Move to Polishing'));
    await waitFor(() =>
      expect(mockChangeStatus).toHaveBeenCalledWith('o1', {
        toStatusId: 's2',
        note: undefined,
      }),
    );
  });

  it('asks why before a move the flow requires a note for', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Move status'));
    await fireEvent.press(await screen.findByText('Put on hold'));
    expect(await screen.findByPlaceholderText('Explain the move')).toBeTruthy();
    expect(mockChangeStatus).not.toHaveBeenCalled();
  });

  it('will not confirm that move on an empty note', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Move status'));
    await fireEvent.press(await screen.findByText('Put on hold'));
    await fireEvent.press(screen.getByText('Confirm move'));
    expect(mockChangeStatus).not.toHaveBeenCalled();
  });

  it('sends the note with the move', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Move status'));
    await fireEvent.press(await screen.findByText('Put on hold'));
    await fireEvent.changeText(
      screen.getByPlaceholderText('Explain the move'),
      ' waiting on the client ',
    );
    await fireEvent.press(screen.getByText('Confirm move'));
    await waitFor(() =>
      expect(mockChangeStatus).toHaveBeenCalledWith('o1', {
        toStatusId: 's9',
        note: 'waiting on the client',
      }),
    );
  });

  it('shows the server’s refusal rather than pretending the move happened', async () => {
    mockChangeStatus.mockRejectedValue(
      new Error('The flow does not allow moving from Cutting to Polishing'),
    );
    await mount();
    await fireEvent.press(screen.getByText('Move status'));
    await fireEvent.press(await screen.findByText('Move to Polishing'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Could not move');
  });
});

describe('sending the order back', () => {
  const BACK = [{ transitionId: 't0', toStatus: { id: 's0', name: 'Design', color: '#8957E5' } }];

  const allowed = () => {
    mockPermissions = [...mockPermissions, PERMISSIONS.ORDER_MOVE_BACK];
    mockAllowedBack.mockResolvedValue(BACK);
  };

  it('is not offered to somebody who cannot make it', async () => {
    mockAllowedBack.mockResolvedValue(BACK);
    await mount();
    await fireEvent.press(screen.getByText('Move status'));
    await screen.findByText('Move to Polishing');
    // Not even asked for: the answer would be unusable.
    expect(mockAllowedBack).not.toHaveBeenCalled();
    expect(screen.queryByText('Back to Design')).toBeNull();
  });

  it('offers it apart from the ordinary moves, to somebody allowed to', async () => {
    allowed();
    await mount();
    await waitFor(() => expect(mockAllowedBack).toHaveBeenCalledWith('s1'));
    await fireEvent.press(screen.getByText('Move status'));
    expect(await screen.findByText('Not the usual journey')).toBeTruthy();
    expect(screen.getByText('Back to Design')).toBeTruthy();
  });

  it('asks before it does it, naming both ends', async () => {
    allowed();
    await mount();
    await fireEvent.press(screen.getByText('Move status'));
    await fireEvent.press(await screen.findByText('Back to Design'));
    expect(await screen.findByText(/is not a step/)).toBeTruthy();
    expect(screen.getByText(/would go back a stage/)).toBeTruthy();
    // Nothing is sent on the strength of one tap.
    expect(mockChangeStatus).not.toHaveBeenCalled();
  });

  it('leaves it where it is when the question is declined', async () => {
    allowed();
    await mount();
    await fireEvent.press(screen.getByText('Move status'));
    await fireEvent.press(await screen.findByText('Back to Design'));
    await fireEvent.press(await screen.findByText('Leave it where it is'));
    expect(mockChangeStatus).not.toHaveBeenCalled();
    expect(await screen.findByText('Back to Design')).toBeTruthy();
  });

  it('says out loud that it is a reversal when it sends it', async () => {
    allowed();
    await mount();
    await fireEvent.press(screen.getByText('Move status'));
    await fireEvent.press(await screen.findByText('Back to Design'));
    await fireEvent.changeText(
      screen.getByPlaceholderText('A note for whoever reads this later'),
      ' client changed the design ',
    );
    await fireEvent.press(screen.getByText('Yes, move it back'));
    await waitFor(() =>
      expect(mockChangeStatus).toHaveBeenCalledWith('o1', {
        toStatusId: 's0',
        note: 'client changed the design',
        reverse: true,
      }),
    );
  });

  it('goes back without a note when none is offered', async () => {
    allowed();
    await mount();
    await fireEvent.press(screen.getByText('Move status'));
    await fireEvent.press(await screen.findByText('Back to Design'));
    await fireEvent.press(screen.getByText('Yes, move it back'));
    await waitFor(() =>
      expect(mockChangeStatus).toHaveBeenCalledWith('o1', {
        toStatusId: 's0',
        note: undefined,
        reverse: true,
      }),
    );
  });

  it('shows the server’s refusal of a move back', async () => {
    allowed();
    mockChangeStatus.mockRejectedValue(new Error('Only somebody allowed to can do it'));
    await mount();
    await fireEvent.press(screen.getByText('Move status'));
    await fireEvent.press(await screen.findByText('Back to Design'));
    await fireEvent.press(screen.getByText('Yes, move it back'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Could not move it back');
  });

  it('offers the way back even where the flow leads nowhere onward', async () => {
    allowed();
    mockAllowedNext.mockResolvedValue([]);
    await mount();
    // A terminal stage entered by mistake was previously a dead end.
    await fireEvent.press(await screen.findByText('Move status'));
    expect(await screen.findByText('Back to Design')).toBeTruthy();
  });

  it('marks a reversal in the history, which otherwise reads as an ordinary step', async () => {
    await mount({
      statusHistory: [
        {
          id: 'h1',
          fromStatus: { name: 'Production', color: '#D29922' },
          toStatus: { name: 'Design', color: '#8957E5' },
          note: 'Client changed it',
          reversed: true,
          changedBy: { name: 'Nakul' },
          changedAt: '2026-09-02T10:00:00Z',
        },
      ],
    });
    expect(await screen.findByText(/went back/)).toBeTruthy();
  });
});

describe('changing the GST treatment', () => {
  const openSheet = () => fireEvent.press(screen.getByText('GST treatment'));

  it('spells out what each treatment means in the shop’s own words', async () => {
    await mount();
    await openSheet();
    // "GST charged on top" also labels the money card, so it appears twice.
    expect((await screen.findAllByText('GST charged on top')).length).toBeGreaterThan(1);
    expect(screen.getByText('GST included in the quote')).toBeTruthy();
    expect(
      screen.getByText('GST absorbed — client pays the quoted figure'),
    ).toBeTruthy();
  });

  it('warns that absorbing may settle what has already been collected', async () => {
    await mount();
    await openSheet();
    expect(
      await screen.findByText(/the order total drops and what has already been collected may now settle it/),
    ).toBeTruthy();
  });

  it('re-prices to the treatment that was chosen', async () => {
    await mount();
    await openSheet();
    await fireEvent.press(await screen.findByText('GST absorbed — client pays the quoted figure'));
    await waitFor(() =>
      expect(mockReprice).toHaveBeenCalledWith('o1', { taxTreatment: 'ABSORBED' }),
    );
  });

  it('does nothing but close when the treatment is already that', async () => {
    await mount();
    await openSheet();
    await fireEvent.press((await screen.findAllByText('GST charged on top')).at(-1)!);
    expect(mockReprice).not.toHaveBeenCalled();
  });

  it('shows the server’s refusal', async () => {
    mockReprice.mockRejectedValue(new Error('Order o1 not found'));
    await mount();
    await openSheet();
    await fireEvent.press(await screen.findByText('GST included in the quote'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Could not change it');
  });
});

it('opens the photo screen', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Add photos'));
  expect(navigate).toHaveBeenCalledWith('OrderPhotos', { orderId: 'o1' });
});

it('shows the history as a table, not a paragraph', async () => {
  await mount();
  expect(screen.getByText('History')).toBeTruthy();
  expect(screen.getByText('Ravi')).toBeTruthy();
  expect(screen.getByText('Order punched')).toBeTruthy();
});

it('shows the order number in the header and on the card', async () => {
  await mount();
  expect(screen.getAllByText('ORD-2627-0002')).toHaveLength(2);
});

describe('an order punched before it was priced', () => {
  const unpriced = { grandTotal: 0, total: 0, taxAmount: 0 };

  it('still offers a way forward instead of hiding the money entirely', async () => {
    await mount(unpriced);
    // Hiding the block left the order a dead end: no price, no payments.
    expect(screen.getByText('Not priced yet')).toBeTruthy();
    expect(
      screen.getByText('Set what was quoted, then payments can be recorded against it.'),
    ).toBeTruthy();
  });

  it('says plainly that nothing can be collected, to someone who may not price it', async () => {
    mockPermissions = [];
    await mount(unpriced);
    expect(
      screen.getByText('Nothing can be collected until somebody prices it.'),
    ).toBeTruthy();
  });

  it('records the agreed figure as a lump sum', async () => {
    await mount(unpriced);
    await fireEvent.press(screen.getByText('Not priced yet'));
    await fireEvent.changeText(await screen.findByPlaceholderText('0'), '47200');
    await fireEvent.press(screen.getByText('Set the price'));
    await waitFor(() =>
      expect(mockReprice).toHaveBeenCalledWith('o1', {
        pricingMode: 'LUMP_SUM',
        total: 47200,
      }),
    );
  });

  it('will not set a price of nothing', async () => {
    await mount(unpriced);
    await fireEvent.press(screen.getByText('Not priced yet'));
    await fireEvent.press(await screen.findByText('Set the price'));
    expect(mockReprice).not.toHaveBeenCalled();
  });

  it('shows the server’s refusal', async () => {
    mockReprice.mockRejectedValue(new Error('Order o1 not found'));
    await mount(unpriced);
    await fireEvent.press(screen.getByText('Not priced yet'));
    await fireEvent.changeText(await screen.findByPlaceholderText('0'), '47200');
    await fireEvent.press(screen.getByText('Set the price'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Could not price it');
  });
});

it('keeps the heading in view while the order scrolls under it', async () => {
  await mount();
  // An order with its items, its money and its history under it is long
  // enough that the way back was a scroll away.
  expect(screen.getByTestId('sticky-bar')).toBeTruthy();
  expect(screen.getByTestId('screen-scroll').props.stickyHeaderIndices).toEqual([0]);
});
