import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@decor/shared';
import EstimatesPage from './page';

const estimatesCall = jest.fn();
jest.mock('@/lib/api', () => ({ api: { estimates: (...a: unknown[]) => estimatesCall(...a) } }));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let granted: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, can: (p: string) => granted.includes(p) }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ESTIMATE = {
  id: 'e1',
  code: 'EST-1',
  client: { name: 'Verma Interiors' },
  clientName: null,
  issuedOn: '2026-09-01T00:00:00.000Z',
  items: [{ id: 'i1' }, { id: 'i2' }],
  grandTotal: '29500',
  status: 'SENT',
};

async function mount(items: unknown[] = [ESTIMATE], total = items.length) {
  estimatesCall.mockResolvedValue({
    data: items,
    meta: { page: 1, pages: 1, total, limit: 25 },
  });
  render(<EstimatesPage />);
  await screen.findByText('Quotes');
  await waitFor(() => expect(estimatesCall).toHaveBeenCalled());
}

const lastQuery = () => estimatesCall.mock.calls.at(-1)![0];

beforeEach(() => {
  jest.clearAllMocks();
  granted = [PERMISSIONS.ESTIMATE_MANAGE];
});

it('says how many have been quoted', async () => {
  await mount([ESTIMATE], 42);
  expect(screen.getByText('42 quoted')).toBeInTheDocument();
});

it('lists each estimate with its client, number, lines and total', async () => {
  await mount();
  expect(screen.getByText('Verma Interiors')).toBeInTheDocument();
  expect(screen.getByText('EST-1')).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument();
  expect(screen.getByText('₹29,500')).toBeInTheDocument();
  expect(screen.getByText('SENT')).toBeInTheDocument();
});

it('falls back to the typed name for a quote with no client record', async () => {
  await mount([{ ...ESTIMATE, client: null, clientName: 'Walk-in' }]);
  expect(screen.getByText('Walk-in')).toBeInTheDocument();
});

it('says so rather than showing a blank for a quote with no name at all', async () => {
  await mount([{ ...ESTIMATE, client: null, clientName: null }]);
  expect(screen.getByText('Unnamed')).toBeInTheDocument();
});

it('opens one', async () => {
  await mount();
  fireEvent.click(screen.getByText('Verma Interiors'));
  expect(push).toHaveBeenCalledWith('/quotes/e1');
});

describe('writing a new one', () => {
  it('is offered to somebody who may quote', async () => {
    await mount();
    fireEvent.click(screen.getAllByText('New quote')[0]);
    expect(push).toHaveBeenCalledWith('/quotes/new');
  });

  it('is not offered to somebody who may only read', async () => {
    granted = [];
    await mount();
    expect(screen.queryByText('New quote')).not.toBeInTheDocument();
  });

  it('is offered from the empty state too, where it is most useful', async () => {
    await mount([]);
    expect(screen.getByText('No quotes yet')).toBeInTheDocument();
    // Offered twice on an empty list: in the header and in the empty state.
    expect(screen.getAllByText('New quote')).toHaveLength(2);
    fireEvent.click(screen.getAllByText('New quote').at(-1)!);
    expect(push).toHaveBeenCalledWith('/quotes/new');
  });
});

describe('searching and filtering', () => {
  it('searches on what was typed', async () => {
    await mount();
    fireEvent.change(screen.getByPlaceholderText('Estimate number or client'), {
      target: { value: 'EST-1' },
    });
    await waitFor(() => expect(lastQuery().search).toBe('EST-1'));
  });

  it('filters by status and says one is on', async () => {
    await mount();
    fireEvent.click(screen.getByText('Filter'));
    fireEvent.click((await screen.findAllByText('ACCEPTED')).at(-1)!);
    fireEvent.click(screen.getByText('Apply 1 filter'));
    await waitFor(() => expect(lastQuery().status).toBe('ACCEPTED'));
    expect(screen.getByText('1 filter')).toBeInTheDocument();
  });

  it('clears the filter again', async () => {
    await mount();
    fireEvent.click(screen.getByText('Filter'));
    fireEvent.click((await screen.findAllByText('ACCEPTED')).at(-1)!);
    fireEvent.click(screen.getByText('Apply 1 filter'));
    await waitFor(() => expect(lastQuery().status).toBe('ACCEPTED'));
    fireEvent.click(screen.getByText('1 filter'));
    fireEvent.click(await screen.findByText('Clear all'));
    await waitFor(() => expect(lastQuery().status).toBeUndefined());
  });
});
