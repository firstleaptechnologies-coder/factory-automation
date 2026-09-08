import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PERMISSIONS } from '@decor/shared';
import DisbursementsPage from './page';

const apiMock = { disbursementLedger: jest.fn(), setDisbursementLabel: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...args),
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

const ROW = {
  id: 'd1',
  orderId: 'o1',
  order: { code: 'ORD-1', client: { name: 'Verma Interiors' } },
  payeeName: 'Ramesh (fitter)',
  category: { id: 'c1', name: 'Fitting' },
  paidAt: '2026-09-01T00:00:00.000Z',
  amount: '4000',
  status: 'PAID',
};

const page = (items: unknown[] = [ROW], over: Record<string, unknown> = {}) => ({
  data: items,
  meta: { page: 1, pages: 1, total: items.length, limit: 25 },
  label: 'Payouts',
  totals: { total: 12000, paid: 8000, pending: 4000, count: 2 },
  ...over,
});

async function mount(result: unknown = page()) {
  apiMock.disbursementLedger.mockResolvedValue(result);
  render(<DisbursementsPage />);
  await waitFor(() => expect(apiMock.disbursementLedger).toHaveBeenCalled());
  await screen.findByText(/ ledger$/);
}

const field = (label: string) =>
  Array.from(document.querySelectorAll('label.field'))
    .find((node) => node.querySelector('.field-label')?.textContent?.startsWith(label))!
    .querySelector('input') as HTMLInputElement;

const lastQuery = () => apiMock.disbursementLedger.mock.calls.at(-1)![0];

beforeEach(() => {
  jest.clearAllMocks();
  granted = [PERMISSIONS.DISBURSEMENT_MANAGE];
  apiMock.setDisbursementLabel.mockResolvedValue({});
});

it('says plainly that this is money going out after the client has paid', async () => {
  await mount();
  expect(
    screen.getByText('Money paid out to other people, after the client has paid'),
  ).toBeInTheDocument();
});

it('describes the whole ledger, not just the page of rows on screen', async () => {
  await mount();
  expect(screen.getByText(/Committed across 2 payouts/)).toBeInTheDocument();
  expect(screen.getByText('₹12,000')).toBeInTheDocument();
  expect(screen.getByText('₹8,000')).toBeInTheDocument();
});

it('counts a single payout in the singular', async () => {
  await mount(page([ROW], { totals: { total: 4000, paid: 4000, pending: 0, count: 1 } }));
  expect(screen.getByText(/Committed across 1 payout$/)).toBeInTheDocument();
});

describe('the rows', () => {
  it('name who was paid, out of which order, and what for', async () => {
    await mount();
    expect(screen.getByText('Ramesh (fitter)')).toBeInTheDocument();
    expect(screen.getByText('ORD-1')).toBeInTheDocument();
    expect(screen.getByText('Verma Interiors')).toBeInTheDocument();
    expect(screen.getByText('Fitting')).toBeInTheDocument();
  });

  it('says uncategorised rather than nothing', async () => {
    await mount(page([{ ...ROW, category: null }]));
    expect(screen.getByText('Uncategorised')).toBeInTheDocument();
  });

  it('marks what is paid, what is owed and what was cancelled', async () => {
    await mount(page([ROW, { ...ROW, id: 'd2', status: 'PLANNED', paidAt: null }, { ...ROW, id: 'd3', status: 'CANCELLED' }]));
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Owed')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('opens the order a payout came out of', async () => {
    await mount();
    fireEvent.click(screen.getByText('Ramesh (fitter)'));
    expect(push).toHaveBeenCalledWith('/orders/o1/disbursements');
  });

  it('goes nowhere for a payout attached to no order', async () => {
    await mount(page([{ ...ROW, order: null, orderId: null }]));
    fireEvent.click(screen.getByText('Ramesh (fitter)'));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('says so when there is nothing in the ledger', async () => {
    await mount(page([]));
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });
});

describe('searching and filtering', () => {
  it('searches on what was typed', async () => {
    await mount();
    fireEvent.change(screen.getByPlaceholderText('Payee or order number'), {
      target: { value: 'Ramesh' },
    });
    await waitFor(() => expect(lastQuery().search).toBe('Ramesh'));
  });

  it('filters by status and says one is on', async () => {
    await mount();
    fireEvent.click(screen.getByText('Filter'));
    fireEvent.click((await screen.findAllByText('Owed')).at(-1)!);
    fireEvent.click(screen.getByText('Apply 1 filter'));
    await waitFor(() => expect(lastQuery().status).toBe('PLANNED'));
    expect(screen.getByText('1 filter')).toBeInTheDocument();
  });
});

describe('renaming the ledger', () => {
  it('is offered only to somebody who manages payouts', async () => {
    granted = [];
    await mount();
    expect(screen.queryByText('Rename')).not.toBeInTheDocument();
  });

  it('opens on the word currently in use', async () => {
    await mount();
    fireEvent.click(screen.getByText('Rename'));
    await screen.findByText('Rename this ledger');
    expect(field('Called')).toHaveValue('Payouts');
  });

  it('says the whole app follows the word', async () => {
    await mount();
    fireEvent.click(screen.getByText('Rename'));
    expect(
      await screen.findByText('Every heading and button follows this word'),
    ).toBeInTheDocument();
  });

  it('will not save an empty name', async () => {
    await mount();
    fireEvent.click(screen.getByText('Rename'));
    await screen.findByText('Rename this ledger');
    fireEvent.change(field('Called'), { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Save'));
    expect(apiMock.setDisbursementLabel).not.toHaveBeenCalled();
  });

  it('saves the trimmed word and re-reads the ledger', async () => {
    await mount();
    fireEvent.click(screen.getByText('Rename'));
    await screen.findByText('Rename this ledger');
    fireEvent.change(field('Called'), { target: { value: ' ISC ' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(apiMock.setDisbursementLabel).toHaveBeenCalledWith('ISC'));
    await waitFor(() => expect(apiMock.disbursementLedger).toHaveBeenCalledTimes(2));
  });

  it('follows the shop’s own word everywhere', async () => {
    await mount(page([ROW], { label: 'ISC' }));
    expect(screen.getByText('ISC ledger')).toBeInTheDocument();
  });
});
