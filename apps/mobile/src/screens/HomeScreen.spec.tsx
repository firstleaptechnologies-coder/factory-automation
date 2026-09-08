import { fireEvent, render, screen } from '@testing-library/react-native';
import { PERMISSIONS } from '@decor/shared';
import { HomeScreen } from './HomeScreen';

const mockOrders = jest.fn();
const mockLeads = jest.fn();
const mockDefaultWorkflow = jest.fn();
const mockUnread = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    orders: (...a: unknown[]) => mockOrders(...a),
    leads: (...a: unknown[]) => mockLeads(...a),
    defaultWorkflow: (...a: unknown[]) => mockDefaultWorkflow(...a),
    unreadNotifications: (...a: unknown[]) => mockUnread(...a),
  },
}));

let mockUser: Record<string, unknown> | null = {
  name: 'Nakul',
  code: 'ADMIN',
  role: 'ADMIN',
  permissions: [],
};
let mockGranted: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, can: (p: string) => mockGranted.includes(p) }),
}));

const ORDER = {
  id: 'o1',
  code: 'ORD-1',
  createdAt: new Date().toISOString(),
  location: 'Andheri',
  client: { name: 'Verma Interiors' },
  status: { name: 'Cutting', color: '#FF6B1A' },
  items: [],
};

const navigate = jest.fn();

/** A stage as the flow hands it over, counts and all. */
const stage = (over: Record<string, unknown>) => ({
  color: '#6B7785',
  homeCardOrder: null,
  _count: { ordersAtStatus: 0 },
  ...over,
});

const FLOW = {
  id: 'w1',
  name: 'Order journey',
  statuses: [
    stage({ id: 's0', name: 'Lead' }),
    stage({ id: 's1', name: 'Order confirmed', homeCardOrder: 0, _count: { ordersAtStatus: 4 } }),
    stage({ id: 's2', name: 'Design', homeCardOrder: 1, _count: { ordersAtStatus: 2 } }),
    stage({ id: 's3', name: 'Design approval', homeCardOrder: 2, _count: { ordersAtStatus: 1 } }),
    stage({ id: 's4', name: 'Production', homeCardOrder: 3 }),
    stage({ id: 's5', name: 'QC & Sanding', homeCardOrder: 4 }),
    stage({ id: 's6', name: 'Delivered', _count: { ordersAtStatus: 9 } }),
  ],
  transitions: [],
};

const LEAD = {
  id: 'l1',
  code: 'LEAD-1',
  title: 'Kitchen jali',
  estimatedValue: '250000',
  status: { name: 'Quoted', color: '#D29922' },
  contactName: 'Verma',
};

async function mount(orders = [ORDER], leads: unknown[] = [LEAD], flow: unknown = FLOW) {
  mockOrders.mockResolvedValue({
    data: orders,
    meta: { page: 1, pages: 1, total: 137, limit: 6 },
    unit: 'FT',
  });
  mockLeads.mockResolvedValue({ data: leads, meta: { page: 1, pages: 1, total: leads.length, limit: 50 } });
  mockDefaultWorkflow.mockResolvedValue(flow);
  await render(<HomeScreen navigation={{ navigate }} />);
  await screen.findByText('Where the work is');
}

beforeEach(() => {
  mockUnread.mockResolvedValue({ unread: 0 });
  jest.clearAllMocks();
  mockUser = { name: 'Nakul', code: 'ADMIN', role: 'ADMIN', permissions: [] };
  mockGranted = [
    PERMISSIONS.ESTIMATE_VIEW,
    PERMISSIONS.CLIENT_VIEW,
    PERMISSIONS.CASH_POSITION_VIEW,
    PERMISSIONS.DISBURSEMENT_VIEW,
    PERMISSIONS.ORDER_PUNCH,
  ];
});

it('greets the person who is signed in', async () => {
  await mount();
  expect(screen.getByText('Nakul')).toBeTruthy();
  expect(screen.getByText('ADMIN · ADMIN')).toBeTruthy();
});

describe('where the work is', () => {
  it('counts only the stages chosen for the card', async () => {
    await mount();
    expect(screen.getByText('Order confirmed')).toBeTruthy();
    expect(screen.getByText('QC & Sanding')).toBeTruthy();
    // Not on the card, however many orders sit there.
    expect(screen.queryByText('Delivered')).toBeNull();
    expect(screen.queryByText('Lead')).toBeNull();
  });

  it('shows each stage’s count', async () => {
    await mount();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('counts an empty stage as none rather than leaving it blank', async () => {
    await mount();
    // Production and QC & Sanding are both empty.
    expect(screen.getAllByText('0').length).toBe(2);
  });

  it('reads the stages in the order the card was set to, not the flow’s', async () => {
    await mount([ORDER], [LEAD], {
      ...FLOW,
      statuses: [
        stage({ id: 's2', name: 'Design', homeCardOrder: 1 }),
        stage({ id: 's1', name: 'Order confirmed', homeCardOrder: 0 }),
      ],
    });
    const names = screen
      .getAllByText(/^(Design|Order confirmed)$/)
      .map((node) => node.props.children);
    expect(names).toEqual(['Order confirmed', 'Design']);
  });

  /** The size a label is actually drawn at, whatever the style is built from. */
  const sizeOf = (text: string) =>
    Object.assign({}, ...[screen.getByText(text).props.style].flat(Infinity).filter(Boolean))
      .fontSize;

  /** Give the card a width; jest measures every box as zero on its own. */
  const measure = async (width = 340) =>
    fireEvent(screen.getByTestId('home-card-measure'), 'layout', {
      nativeEvent: { layout: { width, height: 0, x: 0, y: 0 } },
    });

  it('keeps a stage name on one line rather than wrapping it', async () => {
    await mount();
    // Wrapped over two lines, the row of counts fell out of line with itself
    // and the card read as ragged.
    expect(screen.getByText('Order confirmed').props.numberOfLines).toBe(1);
  });

  it('draws every stage name at the same size, whatever its own length', async () => {
    await mount();
    await measure();
    // Left to shrink themselves, five labels came out at five sizes — "Design"
    // full size beside a visibly smaller "Order confirmed", which reads as a
    // mistake rather than as a fit.
    const sizes = ['Order confirmed', 'Design', 'Design approval', 'Production', 'QC & Sanding']
      .map(sizeOf);
    expect(new Set(sizes).size).toBe(1);
  });

  it('sizes the row down when a long stage name will not fit', async () => {
    await mount();
    await measure(240);
    const tight = sizeOf('Design');
    await measure(600);
    expect(sizeOf('Design')).toBeGreaterThan(tight);
  });

  it('draws every tile label at one size too', async () => {
    await mount();
    await measure();
    const sizes = ['Quotes', 'Clients', 'Transactions', 'Payout', 'Punch'].map(sizeOf);
    expect(new Set(sizes).size).toBe(1);
  });

  it('opens that stage’s orders when a count is tapped', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('home-stage-s2'));
    expect(navigate).toHaveBeenCalledWith('Orders', { statusId: 's2' });
  });

  it('says how to fill an empty card, to somebody who can', async () => {
    await mount([ORDER], [LEAD], { ...FLOW, statuses: [stage({ id: 's0', name: 'Lead' })] });
    expect(screen.getByText(/tap the dial to pick which ones/)).toBeTruthy();
  });

  it('says something plainer to somebody who cannot change it', async () => {
    mockUser = { name: 'Priya', code: 'PROD01', role: 'PRODUCTION', permissions: [] };
    await mount([ORDER], [LEAD], { ...FLOW, statuses: [stage({ id: 's0', name: 'Lead' })] });
    expect(screen.getByText('No stages are being counted here yet.')).toBeTruthy();
  });

  it('offers the way to change it only to an admin', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('edit-home-card'));
    expect(navigate).toHaveBeenCalledWith('MainCard');

    mockUser = { name: 'Priya', code: 'PROD01', role: 'PRODUCTION', permissions: [] };
    await mount();
    expect(screen.queryByTestId('edit-home-card')).toBeNull();
  });
});

it('counts only leads that have not been converted', async () => {
  await mount();
  expect(mockLeads.mock.calls[0][0]).toMatchObject({ converted: false });
});

it('still says how many leads are open', async () => {
  await mount();
  expect(screen.getByText('1 open')).toBeTruthy();
});

it('says how many orders there are and how many landed today', async () => {
  await mount();
  expect(screen.getByText('137 orders · 1 punched today')).toBeTruthy();
});

it('does not count yesterday’s orders as today’s', async () => {
  await mount([{ ...ORDER, createdAt: '2020-01-01T10:00:00Z' }]);
  expect(screen.getByText('137 orders · 0 punched today')).toBeTruthy();
});

it('says nothing about a lead that carries no value', async () => {
  await mount([ORDER], [{ ...LEAD, estimatedValue: null }]);
  // The hero counts stages now; a lead's value shows on the lead itself.
  expect(screen.queryByText('₹0')).toBeNull();
  expect(screen.getByText('Kitchen jali')).toBeTruthy();
});

it.each([
  ['Quotes', 'Estimates'],
  ['Clients', 'Clients'],
  ['Transactions', 'Transactions'],
  ['Payout', 'DisbursementLedger'],
  ['Punch', 'PunchTab'],
])('the %s tile opens %s', async (label, route) => {
  await mount();
  await fireEvent.press(screen.getByText(label));
  expect(navigate).toHaveBeenCalledWith(route);
});

it('opens an order from the recent list', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Verma Interiors'));
  expect(navigate).toHaveBeenCalledWith('OrderDetail', { orderId: 'o1' });
});

it('says when nothing has been punched yet', async () => {
  await mount([]);
  expect(screen.getByText('Nothing punched yet')).toBeTruthy();
});

it('opens the notifications the bell stands for', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('open-notifications'));
  expect(navigate).toHaveBeenCalledWith('Notifications');
});

it('leaves search and the settings dial to the bar', async () => {
  await mount();
  // Both moved down to the tab bar; the bell is what is about this moment.
  expect(screen.queryByLabelText('Search')).toBeNull();
  expect(screen.getByTestId('open-notifications')).toBeTruthy();
});

it('opens settings from the identity block', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Nakul'));
  expect(navigate).toHaveBeenCalledWith('Settings');
});

it('offers only the actions this person is allowed to take', async () => {
  mockGranted = [PERMISSIONS.CLIENT_VIEW];
  await mount();
  expect(screen.getByText('Clients')).toBeTruthy();
  for (const hidden of ['Quote', 'Cash', 'Payout', 'Punch']) {
    expect(screen.queryByText(hidden)).toBeNull();
  }
});

it('puts punching last, where a thumb lands', async () => {
  await mount();
  const labels = ['Quotes', 'Clients', 'Transactions', 'Payout', 'Punch'];
  for (const label of labels) expect(screen.getByText(label)).toBeTruthy();
});

it('offers no board of its own — each list is the way to its board', async () => {
  await mount();
  expect(screen.queryByText('Board')).toBeNull();
});


describe('the bell', () => {
  it('carries a count of what is waiting', async () => {
    mockUnread.mockResolvedValue({ unread: 3 });
    await mount();
    // "Three things happened" is a different decision from "something
    // happened".
    expect(await screen.findByTestId('unread-badge')).toBeTruthy();
    expect(screen.getByTestId('unread-badge')).toHaveTextContent('3');
  });

  it('stops counting past nine, which is enough to make the point', async () => {
    mockUnread.mockResolvedValue({ unread: 42 });
    await mount();
    expect(await screen.findByTestId('unread-badge')).toHaveTextContent('9+');
  });

  it('shows nothing when there is nothing', async () => {
    await mount();
    expect(screen.queryByTestId('unread-badge')).toBeNull();
  });
});
