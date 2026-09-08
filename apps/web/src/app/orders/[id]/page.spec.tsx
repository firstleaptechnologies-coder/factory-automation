import { Suspense } from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@decor/shared';
import OrderPage from './page';

const apiMock: Record<string, jest.Mock> = {
  order: jest.fn(),
  allowedNext: jest.fn(),
  allowedBack: jest.fn(),
  changeOrderStatus: jest.fn(),
  repriceOrder: jest.fn(),
  fileUrl: jest.fn((id: string) => `https://api.test/files/${id}`),
  getToken: jest.fn(() => 'tok'),
  history: jest.fn(),
};
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) => apiMock[key](...args),
    },
  ),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let granted: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, can: (p: string) => granted.includes(p) }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ITEM = {
  id: 'i1',
  lengthMm: '2438.4',
  widthMm: '1219.2',
  quantity: 3,
  amount: '15000',
  material: { id: 'm1', name: 'Plywood', color: '#C08A4B' },
  display: { length: 8, width: 4, unit: 'FT', thickness: 18, thicknessUnit: 'MM' },
};

const ORDER = {
  id: 'o1',
  code: 'ORD-2627-0003',
  client: { id: 'c1', name: 'Verma Interiors' },
  location: 'Andheri',
  status: { id: 's2', name: 'Cutting', color: '#FF6B1A' },
  paymentStatus: 'PARTIAL',
  taxTreatment: 'EXCLUSIVE',
  taxDiscount: '0',
  total: '25000',
  taxAmount: '4500',
  grandTotal: '29500',
  items: [ITEM],
  attachments: [],
  statusHistory: [
    {
      id: 'h1',
      changedAt: '2026-09-07T14:30:00.000Z',
      fromStatus: { name: 'Punched' },
      toStatus: { name: 'Cutting' },
      note: 'Sheet loaded',
      changedBy: { name: 'Production' },
    },
  ],
};

const open = async (order: unknown = ORDER) => {
  apiMock.order.mockResolvedValue(order);
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <OrderPage params={Promise.resolve({ id: 'o1' })} />
      </Suspense>,
    );
  });
};

async function mount(order: unknown = ORDER) {
  await open(order);
  await screen.findByText('ORD-2627-0003');
}

const field = (label: string) =>
  Array.from(document.querySelectorAll('label.field'))
    .find((node) => node.querySelector('.field-label')?.textContent?.startsWith(label))!
    .querySelector('input, textarea') as HTMLInputElement;

beforeEach(() => {
  jest.clearAllMocks();
  granted = [
    PERMISSIONS.ORDER_MOVE_STATUS,
    PERMISSIONS.ORDER_TERMS,
    PERMISSIONS.DISBURSEMENT_VIEW,
    PERMISSIONS.PAYMENT_VIEW,
  ];
  apiMock.fileUrl.mockImplementation((id: string) => `https://api.test/files/${id}`);
  apiMock.history.mockResolvedValue([]);
  apiMock.getToken.mockReturnValue('tok');
  apiMock.allowedNext.mockResolvedValue([]);
  apiMock.allowedBack.mockResolvedValue([]);
  apiMock.changeOrderStatus.mockResolvedValue({});
  apiMock.repriceOrder.mockResolvedValue({});
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => ({
    ok: true,
    blob: async () => new Blob(['x']),
  }));
  (URL as unknown as Record<string, unknown>).createObjectURL = jest.fn(() => 'blob:1');
  (URL as unknown as Record<string, unknown>).revokeObjectURL = jest.fn();
});

it('says it is loading rather than showing an empty order', async () => {
  apiMock.order.mockReturnValue(new Promise(() => {}));
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <OrderPage params={Promise.resolve({ id: 'o1' })} />
      </Suspense>,
    );
  });
  expect(await screen.findByText('Loading order')).toBeInTheDocument();
});

it('leads with the order code, the client and where it is going', async () => {
  await mount();
  expect(screen.getByText('ORD-2627-0003')).toBeInTheDocument();
  expect(screen.getByText('Verma Interiors · Andheri')).toBeInTheDocument();
  expect(screen.getByText('Cutting')).toBeInTheDocument();
});

describe('the items', () => {
  it('shows each line in the unit being read, and what is stored underneath', async () => {
    await mount();
    expect(screen.getByText('8 × 4 ft')).toBeInTheDocument();
    expect(screen.getByText('2438.4 × 1219.2 mm stored')).toBeInTheDocument();
  });

  it('re-reads the order when a different unit is picked', async () => {
    await mount();
    fireEvent.click(screen.getByText('mm'));
    await waitFor(() => expect(apiMock.order).toHaveBeenCalledWith('o1', 'MM'));
  });

  it('stops repeating the millimetres once the sheet is being read in them', async () => {
    await mount();
    fireEvent.click(screen.getByText('mm'));
    await waitFor(() => expect(apiMock.order).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/mm stored/)).not.toBeInTheDocument();
  });

  it('shows the material, its thickness and the quantity', async () => {
    await mount();
    expect(screen.getByText('Plywood')).toBeInTheDocument();
    expect(screen.getByText('18 mm')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('draws a dash where a line has no size or no price yet', async () => {
    await mount({
      ...ORDER,
      items: [{ ...ITEM, display: null, amount: '0' }],
    });
    expect(screen.getAllByText('—').length).toBeGreaterThan(1);
  });
});

describe('the money', () => {
  it('shows what is taxable, the GST and what the client pays', async () => {
    await mount();
    expect(screen.getByText('₹25,000')).toBeInTheDocument();
    expect(screen.getByText('₹4,500')).toBeInTheDocument();
    expect(screen.getByText('₹29,500')).toBeInTheDocument();
    expect(screen.getByText('PARTIAL')).toBeInTheDocument();
  });

  it('opens the payment ledger', async () => {
    await mount();
    fireEvent.click(screen.getByText('Money'));
    expect(push).toHaveBeenCalledWith('/orders/o1/payments');
  });

  it('still shows the totals to somebody who may not open the ledger', async () => {
    granted = [PERMISSIONS.ORDER_MOVE_STATUS];
    await mount();
    // The floor sees no money, and the API refuses them the ledger, so the
    // way in is not offered either.
    expect(screen.getByText('₹29,500')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Money'));
    expect(push).not.toHaveBeenCalled();
  });

  it('says how the GST was quoted', async () => {
    await mount();
    expect(screen.getAllByText('GST charged on top').length).toBeGreaterThan(0);
  });

  it('says how much tax was absorbed, when any was', async () => {
    await mount({ ...ORDER, taxTreatment: 'ABSORBED', taxDiscount: '4500' });
    expect(screen.getByText(/₹4,500 absorbed/)).toBeInTheDocument();
  });

  describe('an order nobody has priced yet', () => {
    const UNPRICED = { ...ORDER, total: '0', taxAmount: '0', grandTotal: '0' };

    it('offers a way to price it rather than a dead end', async () => {
      await mount(UNPRICED);
      // An order can be punched before it is quoted; hiding the money block
      // left no way to price it and no way to reach payments.
      expect(screen.getByText('Not priced yet')).toBeInTheDocument();
      expect(
        screen.getByText('Set what was quoted, then payments can be recorded against it.'),
      ).toBeInTheDocument();
    });

    it('tells somebody who may not price it why nothing can be collected', async () => {
      granted = [];
      await mount(UNPRICED);
      expect(
        screen.getByText('Nothing can be collected until somebody prices it.'),
      ).toBeInTheDocument();
    });

    it('records the agreed figure as one lump sum', async () => {
      await mount(UNPRICED);
      fireEvent.click(screen.getByText('Not priced yet'));
      await screen.findByText('What was quoted?');
      fireEvent.change(field('Amount'), { target: { value: '29500' } });
      fireEvent.click(screen.getByText('Set the price'));
      await waitFor(() => expect(apiMock.repriceOrder).toHaveBeenCalled());
      expect(apiMock.repriceOrder.mock.calls[0]).toEqual([
        'o1',
        { pricingMode: 'LUMP_SUM', total: 29500 },
      ]);
    });

    it('will not set a price of nothing', async () => {
      await mount(UNPRICED);
      fireEvent.click(screen.getByText('Not priced yet'));
      fireEvent.click(await screen.findByText('Set the price'));
      expect(apiMock.repriceOrder).not.toHaveBeenCalled();
    });

    it('re-reads the order once it has been priced', async () => {
      await mount(UNPRICED);
      fireEvent.click(screen.getByText('Not priced yet'));
      await screen.findByText('What was quoted?');
      fireEvent.change(field('Amount'), { target: { value: '29500' } });
      fireEvent.click(screen.getByText('Set the price'));
      await waitFor(() => expect(apiMock.order).toHaveBeenCalledTimes(2));
    });

    it('does not offer the GST treatment before there is a price', async () => {
      await mount(UNPRICED);
      expect(screen.queryByText('GST treatment')).not.toBeInTheDocument();
    });
  });
});

describe('the GST treatment', () => {
  const openSheet = async () => {
    await mount();
    fireEvent.click(screen.getByText('GST treatment'));
    await screen.findByText('Re-prices every line from the rate it was quoted at');
  };

  it('is offered only to somebody allowed to change terms', async () => {
    granted = [PERMISSIONS.ORDER_MOVE_STATUS];
    await mount();
    expect(screen.queryByText('GST treatment')).not.toBeInTheDocument();
  });

  it('explains what absorbing the tax does to the total', async () => {
    await openSheet();
    expect(screen.getByText(/the order total drops/)).toBeInTheDocument();
  });

  it('re-prices the order when a different treatment is chosen', async () => {
    await openSheet();
    fireEvent.click(screen.getByText('GST absorbed — client pays the quoted figure'));
    await waitFor(() => expect(apiMock.repriceOrder).toHaveBeenCalled());
    expect(apiMock.repriceOrder.mock.calls[0]).toEqual(['o1', { taxTreatment: 'ABSORBED' }]);
  });

  it('changes nothing when the treatment it already has is chosen again', async () => {
    await openSheet();
    fireEvent.click(screen.getAllByText('GST charged on top').at(-1)!);
    await waitFor(() =>
      expect(screen.queryByText('Re-prices every line from the rate it was quoted at')).not.toBeInTheDocument(),
    );
    expect(apiMock.repriceOrder).not.toHaveBeenCalled();
  });
});

describe('payouts', () => {
  it('are reachable, and described as separate from the order', async () => {
    await mount();
    expect(
      screen.getByText('What this order owes other people. Kept separate from the order total.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText('Payouts'));
    expect(push).toHaveBeenCalledWith('/orders/o1/disbursements');
  });

  it('are hidden from somebody who may not see them', async () => {
    granted = [];
    await mount();
    expect(screen.queryByText('Payouts')).not.toBeInTheDocument();
  });
});

describe('moving the order on', () => {
  it('is offered only to somebody allowed to move it', async () => {
    granted = [];
    await mount();
    expect(screen.queryByText('Move status')).not.toBeInTheDocument();
  });

  it('asks the server what is allowed from where it stands', async () => {
    await mount();
    fireEvent.click(screen.getByText('Move status'));
    await waitFor(() => expect(apiMock.allowedNext).toHaveBeenCalledWith('s2'));
    expect(await screen.findByText('From Cutting')).toBeInTheDocument();
  });

  it('says so, and where to fix it, when the stage leads nowhere', async () => {
    await mount();
    fireEvent.click(screen.getByText('Move status'));
    expect(
      await screen.findByText(/No moves are allowed from Cutting/),
    ).toBeInTheDocument();
  });

  it('moves straight away when the move needs nothing said', async () => {
    apiMock.allowedNext.mockResolvedValue([
      {
        id: 't1',
        toStatusId: 's3',
        label: null,
        requiresNote: false,
        toStatus: { id: 's3', name: 'Polishing', color: '#2EA043' },
      },
    ]);
    await mount();
    fireEvent.click(screen.getByText('Move status'));
    fireEvent.click(await screen.findByText('Polishing'));
    await waitFor(() => expect(apiMock.changeOrderStatus).toHaveBeenCalled());
    expect(apiMock.changeOrderStatus.mock.calls[0]).toEqual([
      'o1',
      { toStatusId: 's3', note: undefined },
    ]);
  });

  it('demands the note a move was configured to need', async () => {
    apiMock.allowedNext.mockResolvedValue([
      {
        id: 't2',
        toStatusId: 's9',
        label: 'Send back',
        requiresNote: true,
        toStatus: { id: 's9', name: 'Rework', color: '#DA3633' },
      },
    ]);
    await mount();
    fireEvent.click(screen.getByText('Move status'));
    fireEvent.click(await screen.findByText('Send back'));
    expect(await screen.findByText('Rework needs a note.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Move to Rework'));
    expect(apiMock.changeOrderStatus).not.toHaveBeenCalled();

    fireEvent.change(field('Note'), { target: { value: ' Edge chipped ' } });
    fireEvent.click(screen.getByText('Move to Rework'));
    await waitFor(() => expect(apiMock.changeOrderStatus).toHaveBeenCalled());
    expect(apiMock.changeOrderStatus.mock.calls[0][1].note).toBe('Edge chipped');
  });

  it('shows the server’s refusal instead of pretending it moved', async () => {
    apiMock.allowedNext.mockResolvedValue([
      {
        id: 't1',
        toStatusId: 's3',
        label: null,
        requiresNote: false,
        toStatus: { id: 's3', name: 'Polishing', color: '#2EA043' },
      },
    ]);
    apiMock.changeOrderStatus.mockRejectedValue(new Error('That move is not allowed'));
    await mount();
    fireEvent.click(screen.getByText('Move status'));
    fireEvent.click(await screen.findByText('Polishing'));
    expect(await screen.findByText('That move is not allowed')).toBeInTheDocument();
  });
});

describe('sending the order back', () => {
  const BACK = [
    { transitionId: 't0', toStatus: { id: 's1', name: 'Design', color: '#8957E5' } },
  ];

  const allowed = () => {
    granted = [...granted, PERMISSIONS.ORDER_MOVE_BACK];
    apiMock.allowedBack.mockResolvedValue(BACK);
  };

  it('is not offered to somebody who cannot make it', async () => {
    apiMock.allowedBack.mockResolvedValue(BACK);
    await mount();
    fireEvent.click(screen.getByText('Move status'));
    await screen.findByText('From Cutting');
    // Not even asked for: the answer would be unusable.
    expect(apiMock.allowedBack).not.toHaveBeenCalled();
    expect(screen.queryByText('Back to Design')).not.toBeInTheDocument();
  });

  it('offers it apart from the ordinary moves', async () => {
    allowed();
    await mount();
    fireEvent.click(screen.getByText('Move status'));
    await waitFor(() => expect(apiMock.allowedBack).toHaveBeenCalledWith('s2'));
    expect(await screen.findByText('Not the usual journey')).toBeInTheDocument();
    expect(screen.getByText('Back to Design')).toBeInTheDocument();
  });

  it('stops saying the stage leads nowhere when it can at least go back', async () => {
    allowed();
    await mount();
    fireEvent.click(screen.getByText('Move status'));
    await screen.findByText('Back to Design');
    expect(screen.queryByText(/No moves are allowed from Cutting/)).not.toBeInTheDocument();
  });

  it('asks before it does it, naming both ends', async () => {
    allowed();
    await mount();
    fireEvent.click(screen.getByText('Move status'));
    fireEvent.click(await screen.findByText('Back to Design'));
    expect(await screen.findByText(/is not a step/)).toBeInTheDocument();
    expect(screen.getByText(/would go back a stage/)).toBeInTheDocument();
    // Nothing is sent on the strength of one click.
    expect(apiMock.changeOrderStatus).not.toHaveBeenCalled();
  });

  it('leaves it where it is when the question is declined', async () => {
    allowed();
    await mount();
    fireEvent.click(screen.getByText('Move status'));
    fireEvent.click(await screen.findByText('Back to Design'));
    fireEvent.click(await screen.findByText('Leave it where it is'));
    expect(apiMock.changeOrderStatus).not.toHaveBeenCalled();
    expect(await screen.findByText('Back to Design')).toBeInTheDocument();
  });

  it('says out loud that it is a reversal when it sends it', async () => {
    allowed();
    await mount();
    fireEvent.click(screen.getByText('Move status'));
    fireEvent.click(await screen.findByText('Back to Design'));
    await screen.findByText(/would go back a stage/);
    fireEvent.change(field('Why is it going back?'), {
      target: { value: ' Client changed the design ' },
    });
    fireEvent.click(screen.getByText('Yes, move it back'));
    await waitFor(() => expect(apiMock.changeOrderStatus).toHaveBeenCalled());
    expect(apiMock.changeOrderStatus.mock.calls[0]).toEqual([
      'o1',
      { toStatusId: 's1', note: 'Client changed the design', reverse: true },
    ]);
  });

  it('goes back without a note when none is written', async () => {
    allowed();
    await mount();
    fireEvent.click(screen.getByText('Move status'));
    fireEvent.click(await screen.findByText('Back to Design'));
    fireEvent.click(screen.getByText('Yes, move it back'));
    await waitFor(() => expect(apiMock.changeOrderStatus).toHaveBeenCalled());
    expect(apiMock.changeOrderStatus.mock.calls[0][1].note).toBeUndefined();
  });

  it('shows the server’s refusal of a move back', async () => {
    allowed();
    apiMock.changeOrderStatus.mockRejectedValue(new Error('Only somebody allowed to can'));
    await mount();
    fireEvent.click(screen.getByText('Move status'));
    fireEvent.click(await screen.findByText('Back to Design'));
    fireEvent.click(screen.getByText('Yes, move it back'));
    expect(await screen.findByText('Only somebody allowed to can')).toBeInTheDocument();
  });
});

describe('the history', () => {
  const moved = {
    id: 'h9',
    at: '2026-09-02T10:00:00Z',
    kind: 'moved',
    action: 'order.moved_back',
    entity: 'Order',
    entityId: 'o1',
    from: 'Production',
    to: 'Design',
    reversed: true,
    reason: 'Client changed it',
    by: 'Nakul',
  };

  it('marks a step that went back, which reads as an ordinary one otherwise', async () => {
    apiMock.history.mockResolvedValue([moved]);
    await mount();
    expect(screen.getByText('Production → Design · went back')).toBeInTheDocument();
  });

  it('says what moved, when, why and who did it', async () => {
    apiMock.history.mockResolvedValue([moved]);
    await mount();
    expect(screen.getByText(/Client changed it/)).toBeInTheDocument();
    expect(screen.getByText(/Nakul/)).toBeInTheDocument();
  });

  it('shows what was edited on the order, not only where it went', async () => {
    apiMock.history.mockResolvedValue([
      {
        id: 'h10',
        at: '2026-09-03T10:00:00Z',
        kind: 'changed',
        action: 'orderItem.updated',
        entity: 'OrderItem',
        entityId: 'i1',
        by: 'Nakul',
        reason: 'Rate was mis-typed',
        changes: [{ field: 'rate', from: 100, to: 150 }],
      },
    ]);
    await mount();

    // The line whose rate was corrected hangs off the order in the trail, so
    // the order's own history holds it.
    expect(screen.getByText('Rate changed')).toBeInTheDocument();
    expect(screen.getByText(/100 →/)).toBeInTheDocument();
    expect(screen.getByText(/· line/)).toBeInTheDocument();
  });

  it('copes with an order that has no history yet', async () => {
    await mount();
    expect(screen.getByText('History')).toBeInTheDocument();
    expect(screen.getByText('Nothing has happened yet')).toBeInTheDocument();
  });
});

describe('the attachments', () => {
  const withPhotos = {
    ...ORDER,
    attachments: [
      { id: 'a1', kind: 'REFERENCE_IMAGE', description: 'Client sketch', file: { id: 'f1' } },
      { id: 'a2', kind: 'SIZE_IMAGE', description: null, file: { id: 'f2' } },
    ],
  };

  it('shows no strip at all when there are none', async () => {
    await mount();
    expect(screen.queryByText('Attachments')).not.toBeInTheDocument();
  });

  it('puts the sizes first, since that is what an order is opened for', async () => {
    await mount(withPhotos);
    const tiles = document.querySelectorAll('.thumb-tile');
    expect(tiles[0].getAttribute('data-testid')).toBe('attachment-a2');
    expect(tiles[1].getAttribute('data-testid')).toBe('attachment-a1');
  });

  it('labels each one', async () => {
    await mount(withPhotos);
    // Once on the tile and once as the caption under the open viewer's slot.
    expect(screen.getAllByText('Size').length).toBeGreaterThan(0);
    expect(screen.getByText('Client sketch')).toBeInTheDocument();
  });

  it('calls an unlabelled reference photo what it is', async () => {
    await mount({
      ...ORDER,
      attachments: [{ id: 'a3', kind: 'REFERENCE_IMAGE', description: null, file: { id: 'f3' } }],
    });
    expect(screen.getByText('Reference')).toBeInTheDocument();
  });

  it('opens the one that was clicked, not the first', async () => {
    await mount(withPhotos);
    fireEvent.click(screen.getByTestId('attachment-a1'));
    expect(await screen.findByTestId('viewer-image-a1')).toBeInTheDocument();
  });

  it('closes again', async () => {
    await mount(withPhotos);
    fireEvent.click(screen.getByTestId('attachment-a2'));
    await screen.findByTestId('viewer-image-a2');
    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.queryByTestId('viewer-image-a2')).not.toBeInTheDocument();
  });

  it('fetches the picture with the token, never with it in the URL', async () => {
    await mount(withPhotos);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).not.toContain('tok');
    expect(init.headers).toEqual({ Authorization: 'Bearer tok' });
  });
});

it('keeps the heading, the stage and the way to move it in view', async () => {
  await mount();
  // All three were a scroll back to the top away on a long order.
  const bar = screen.getByText('ORD-2627-0003').closest('.sticky-bar');
  expect(bar).not.toBeNull();
  expect(bar!.textContent).toContain('Cutting');
  expect(bar!.textContent).toContain('Move status');
});
