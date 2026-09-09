import { Suspense } from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import ClientPage from './page';

const clientCall = jest.fn();
const historyCall = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    client: (...a: unknown[]) => clientCall(...a),
    history: (...a: unknown[]) => historyCall(...a),
    clientStatementUrl: (id: string) => `http://api.test/clients/${id}/statement`,
  },
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const CLIENT = {
  id: 'c1',
  code: 'CLI-1',
  name: 'Verma Interiors',
  company: 'Verma & Sons',
  phone: '9820012345',
  gstin: '27AAAPV1234C1ZV',
  stateName: 'Maharashtra',
  billingAddress: 'Unit 4\nAndheri East',
  locations: [{ id: 'l1', name: 'Andheri site', useCount: 3 }],
  orders: [
    {
      id: 'o1',
      code: 'ORD-1',
      location: 'Andheri',
      createdAt: new Date().toISOString(),
      grandTotal: '29500',
      status: { name: 'Cutting', color: '#FF6B1A' },
    },
  ],
};

const open = async (client: unknown = CLIENT) => {
  historyCall.mockResolvedValue([]);
  clientCall.mockResolvedValue(client);
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <ClientPage params={Promise.resolve({ id: 'c1' })} />
      </Suspense>,
    );
  });
};

async function mount(client: unknown = CLIENT) {
  await open(client);
  await screen.findAllByText('Verma Interiors');
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('leads with the client and how the shop refers to them', async () => {
  await mount();
  expect(screen.getByText('CLI-1 · Verma & Sons')).toBeInTheDocument();
  expect(screen.getByText('9820012345')).toBeInTheDocument();
});

it('leaves out a company the client does not have', async () => {
  await mount({ ...CLIENT, company: null });
  expect(screen.getByText('CLI-1')).toBeInTheDocument();
});

it('says nothing about a phone number it does not hold', async () => {
  await mount({ ...CLIENT, phone: null });
  expect(screen.queryByText('9820012345')).not.toBeInTheDocument();
});

it('counts the orders the client has given the shop', async () => {
  await mount();
  expect(screen.getByText('1 orders')).toBeInTheDocument();
});

it('counts none rather than leaving it blank', async () => {
  await mount({ ...CLIENT, orders: [] });
  expect(screen.getByText('0 orders')).toBeInTheDocument();
});

describe('the firm details', () => {
  it('summarise the GST registration when there is one', async () => {
    await mount();
    expect(screen.getByText('GSTIN 27AAAPV1234C1ZV · Maharashtra')).toBeInTheDocument();
  });

  it('say what they are for when the client has none', async () => {
    await mount({ ...CLIENT, gstin: null });
    expect(
      screen.getByText('GST number, addresses and a second contact number'),
    ).toBeInTheDocument();
  });

  it('show the billing address as it was written, line breaks and all', async () => {
    await mount();
    const address = screen.getByText(/Unit 4/);
    expect(address).toHaveStyle({ whiteSpace: 'pre-line' });
  });

  it('are reachable from the card and from the button', async () => {
    await mount();
    fireEvent.click(screen.getAllByText('Firm details')[0]);
    expect(push).toHaveBeenCalledWith('/clients/c1/firm');
  });
});

describe('the sites', () => {
  it('lists them with how often each has been used', async () => {
    await mount();
    expect(screen.getByText('Andheri site · 3')).toBeInTheDocument();
  });

  it('says nothing about a count for a site used once and never counted', async () => {
    await mount({ ...CLIENT, locations: [{ id: 'l1', name: 'Andheri site', useCount: 0 }] });
    expect(screen.getByText('Andheri site')).toBeInTheDocument();
  });

  it('shows no section at all when the client has no sites', async () => {
    await mount({ ...CLIENT, locations: [] });
    expect(screen.queryByText('Sites')).not.toBeInTheDocument();
  });
});

describe('the orders', () => {
  it('lists them with where they went and what they were worth', async () => {
    await mount();
    expect(screen.getByText('ORD-1')).toBeInTheDocument();
    expect(screen.getByText(/Andheri ·/)).toBeInTheDocument();
    expect(screen.getByText('₹29,500')).toBeInTheDocument();
    expect(screen.getByText('Cutting')).toBeInTheDocument();
  });

  it('says nothing about money on an order nobody has priced', async () => {
    await mount({ ...CLIENT, orders: [{ ...CLIENT.orders[0], grandTotal: '0' }] });
    expect(screen.queryByText('₹0')).not.toBeInTheDocument();
  });

  it('copes with an order that has no stage yet', async () => {
    await mount({ ...CLIENT, orders: [{ ...CLIENT.orders[0], status: null }] });
    expect(screen.getByText('ORD-1')).toBeInTheDocument();
  });

  it('opens one', async () => {
    await mount();
    fireEvent.click(screen.getByText('ORD-1'));
    expect(push).toHaveBeenCalledWith('/orders/o1');
  });

  it('says so when the client has never ordered', async () => {
    await mount({ ...CLIENT, orders: [] });
    expect(screen.getByText('No orders yet')).toBeInTheDocument();
  });
});

// The statement is paper for the client: opened for the browser to print,
// not downloaded as a file.
it('opens the client’s statement in a new tab', async () => {
  const open = jest.spyOn(window, 'open').mockImplementation(() => null);

  await mount();
  fireEvent.click(screen.getByText('Statement'));

  expect(open).toHaveBeenCalledWith('http://api.test/clients/c1/statement', '_blank');
  open.mockRestore();
});
