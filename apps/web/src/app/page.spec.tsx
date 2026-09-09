import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@fas/shared';
import HomePage from './page';

const ordersCall = jest.fn();
const defaultWorkflow = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    orders: (...a: unknown[]) => ordersCall(...a),
    defaultWorkflow: (...a: unknown[]) => defaultWorkflow(...a),
  },
}));

/** A stage as the flow hands it over, counts and all. */
const stage = (over: Record<string, unknown>) => ({
  color: '#6B7785',
  homeCardOrder: null,
  _count: { ordersAtStatus: 0 },
  ...over,
});

const FLOW = {
  id: 'w1',
  statuses: [
    stage({ id: 's0', name: 'Lead' }),
    stage({ id: 's1', name: 'Order confirmed', homeCardOrder: 0, _count: { ordersAtStatus: 4 } }),
    stage({ id: 's2', name: 'Design', homeCardOrder: 1, _count: { ordersAtStatus: 2 } }),
    stage({ id: 's3', name: 'Delivered' }),
  ],
};

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let granted: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Nakul' },
    can: (p: string) => granted.includes(p),
  }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ORDER = {
  id: 'o1',
  code: 'ORD-1',
  client: { name: 'Verma Interiors' },
  location: 'Andheri',
  createdAt: new Date().toISOString(),
  grandTotal: '29500',
  status: { name: 'Cutting', color: '#FF6B1A' },
};

async function mount(orders: unknown[] = [ORDER], total = orders.length, flow: unknown = FLOW) {
  ordersCall.mockResolvedValue({
    data: orders,
    meta: { page: 1, pages: 1, total, limit: 6 },
    unit: 'FT',
  });
  defaultWorkflow.mockResolvedValue(flow);
  render(<HomePage />);
  await screen.findByText('Where the work is');
}

beforeEach(() => {
  jest.clearAllMocks();
  granted = [
    PERMISSIONS.ORDER_PUNCH,
    PERMISSIONS.ESTIMATE_VIEW,
    PERMISSIONS.ORDER_VIEW,
    PERMISSIONS.CLIENT_VIEW,
    PERMISSIONS.CASH_POSITION_VIEW,
    PERMISSIONS.DISBURSEMENT_VIEW,
    PERMISSIONS.CONFIG_MANAGE,
  ];
});

it('asks for only a screenful of orders', async () => {
  await mount();
  expect(ordersCall).toHaveBeenCalledWith({ limit: 6 });
});

describe('where the work is', () => {
  it('counts only the stages chosen for the card, in their order', async () => {
    await mount();
    const names = Array.from(document.querySelectorAll('.stage-count .t-micro')).map(
      (node) => node.textContent,
    );
    expect(names).toEqual(['Order confirmed', 'Design']);
  });

  it('shows each stage’s count', async () => {
    await mount();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('opens that stage’s orders when a count is clicked', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('home-stage-s2'));
    expect(push).toHaveBeenCalledWith('/orders?statusId=s2');
  });

  it('offers the way to change it to somebody who may configure', async () => {
    await mount();
    fireEvent.click(screen.getByText('Change'));
    expect(push).toHaveBeenCalledWith('/admin/main-card');
  });

  it('offers nobody else that way in', async () => {
    granted = [PERMISSIONS.ORDER_VIEW];
    await mount();
    expect(screen.queryByText('Change')).not.toBeInTheDocument();
  });

  it('says how to fill an empty card', async () => {
    await mount([ORDER], 1, { ...FLOW, statuses: [stage({ id: 's0', name: 'Lead' })] });
    expect(
      screen.getByText('No stages chosen yet — pick which ones this card counts.'),
    ).toBeInTheDocument();
  });
});

it('says how many are on file and who is signed in', async () => {
  await mount([ORDER], 137);
  expect(screen.getByText('137 orders on file · Nakul')).toBeInTheDocument();
});

it('counts one order in the singular', async () => {
  await mount([ORDER], 1);
  expect(screen.getByText('1 order on file · Nakul')).toBeInTheDocument();
});

describe('the shortcuts', () => {
  it.each([
    ['Quotes', '/quotes'],
    ['Clients', '/clients'],
    ['Transactions', '/transactions'],
    ['Payout', '/disbursements'],
    ['Punch', '/punch'],
  ])('opens %s', async (label, href) => {
    await mount();
    fireEvent.click(screen.getByText(label));
    expect(push).toHaveBeenCalledWith(href);
  });

  it('offers only what this person is allowed to do', async () => {
    granted = [PERMISSIONS.CLIENT_VIEW];
    await mount();
    expect(screen.getByText('Clients')).toBeInTheDocument();
    expect(screen.queryByText('Punch')).not.toBeInTheDocument();
    expect(screen.queryByText('Quote')).not.toBeInTheDocument();
    expect(screen.queryByText('Cash')).not.toBeInTheDocument();
    expect(screen.queryByText('Payout')).not.toBeInTheDocument();
  });

  it('puts punching last, where a thumb lands', async () => {
    await mount();
    const labels = Array.from(document.querySelectorAll('.hero-tile')).map(
      (tile) => tile.textContent,
    );
    expect(labels.at(-1)).toBe('Punch');
  });

  it('offers no board of its own — the list is the way in', async () => {
    await mount();
    expect(screen.queryByText('Board')).not.toBeInTheDocument();
  });
});

describe('the recent orders', () => {
  it('leads with the client, then how to find the order', async () => {
    await mount();
    expect(screen.getByText('Verma Interiors')).toBeInTheDocument();
    expect(screen.getByText(/ORD-1 · Andheri/)).toBeInTheDocument();
  });

  it('shows what an order is worth once it has been priced', async () => {
    await mount();
    expect(screen.getByText('₹29,500')).toBeInTheDocument();
  });

  it('says nothing about money on an order nobody has priced', async () => {
    await mount([{ ...ORDER, grandTotal: '0' }]);
    // The card counts stages now; an unpriced order simply shows no figure.
    expect(screen.queryByText('₹0')).not.toBeInTheDocument();
  });

  it('shows where each order stands', async () => {
    await mount();
    expect(screen.getByText('Cutting')).toBeInTheDocument();
  });

  it('opens one', async () => {
    await mount();
    fireEvent.click(screen.getByText('Verma Interiors'));
    expect(push).toHaveBeenCalledWith('/orders/o1');
  });

  it('opens the full list', async () => {
    await mount();
    fireEvent.click(screen.getByText('View all'));
    expect(push).toHaveBeenCalledWith('/orders');
  });

  it('says so when nothing has been punched', async () => {
    await mount([], 0);
    expect(screen.getByText('Nothing punched yet')).toBeInTheDocument();
    expect(screen.getByText('Orders you punch will appear here.')).toBeInTheDocument();
  });
});
