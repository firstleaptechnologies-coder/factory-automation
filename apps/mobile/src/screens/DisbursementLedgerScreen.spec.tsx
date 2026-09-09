import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@fas/shared';
import { DisbursementLedgerScreen } from './DisbursementLedgerScreen';

const mockLedger = jest.fn();
const mockSetLabel = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    disbursementLedger: (...a: unknown[]) => mockLedger(...a),
    setDisbursementLabel: (...a: unknown[]) => mockSetLabel(...a),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const ROW = {
  id: 'd1',
  orderId: 'o1',
  payeeName: 'Ramesh',
  amount: '2500',
  status: 'PAID',
  paidAt: '2026-09-02T10:00:00Z',
  category: { name: 'Installation' },
  order: { code: 'ORD-1', client: { name: 'Verma Interiors' } },
};

const response = (rows: unknown[], over: Record<string, unknown> = {}) => ({
  label: 'ISC',
  totals: { total: 4300, paid: 2500, pending: 1800, count: 2 },
  data: rows,
  meta: { page: 1, pages: 1, total: rows.length, limit: 25 },
  ...over,
});

const navigate = jest.fn();

async function mount(result: unknown = response([ROW])) {
  mockLedger.mockResolvedValue(result);
  await render(<DisbursementLedgerScreen navigation={{ navigate, goBack: jest.fn() }} />);
  await waitFor(() => expect(mockLedger).toHaveBeenCalled());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.DISBURSEMENT_MANAGE];
  mockSetLabel.mockResolvedValue({ label: 'Site charges' });
});

it('totals the whole filtered ledger, not the page on screen', async () => {
  await mount();
  // An accountant reading "committed" wants the figure for everything matching.
  expect(await screen.findByText('Committed across 2 payouts')).toBeTruthy();
  expect(screen.getByText('₹4,300')).toBeTruthy();
});

it('says one payout in the singular', async () => {
  await mount(response([ROW], { totals: { total: 100, paid: 0, pending: 100, count: 1 } }));
  expect(await screen.findByText('Committed across 1 payout')).toBeTruthy();
});

it('shows each payout with its order and client', async () => {
  await mount();
  expect(await screen.findByText('Ramesh')).toBeTruthy();
  expect(screen.getByText('ORD-1 · Verma Interiors')).toBeTruthy();
  expect(screen.getByText(/Installation ·/)).toBeTruthy();
  expect(screen.getByText('Paid')).toBeTruthy();
});

it('opens the order’s own payout screen', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Ramesh'));
  expect(navigate).toHaveBeenCalledWith('Disbursements', {
    orderId: 'o1',
    orderCode: 'ORD-1',
  });
});

it('says an unattached payout has no order rather than crashing', async () => {
  await mount(response([{ ...ROW, order: null, category: null }]));
  expect(await screen.findByText('—')).toBeTruthy();
  expect(screen.getByText(/Uncategorised/)).toBeTruthy();
});

it('says when the ledger is empty', async () => {
  await mount(response([]));
  expect(await screen.findByText('Nothing here yet')).toBeTruthy();
});

it('searches by payee or order number', async () => {
  await mount();
  await fireEvent.changeText(screen.getByPlaceholderText('Payee or order number'), 'Ramesh');
  await waitFor(() =>
    expect(mockLedger.mock.calls.some((c) => c[0].search === 'Ramesh')).toBe(true),
  );
});

it('filters to one status through the shared filter sheet', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('filter-button'));
  await fireEvent(await screen.findByText('Owed'), 'touchEnd');
  await fireEvent.press(screen.getByText('Apply 1 filter'));
  await waitFor(() =>
    expect(mockLedger.mock.calls.some((c) => c[0].status === 'PLANNED')).toBe(true),
  );
});

it('offers cancelled payouts, which are hidden by default', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('filter-button'));
  expect(await screen.findByText('Cancelled')).toBeTruthy();
  expect(screen.getByText('Owed and paid')).toBeTruthy();
});

describe('renaming the ledger', () => {
  it('is offered only to someone who may manage payouts', async () => {
    mockPermissions = [];
    await mount();
    expect(screen.queryByText(/tap to rename/)).toBeNull();
  });

  it('says what the tenant currently calls it', async () => {
    await mount();
    expect(await screen.findByText('Called "ISC" here — tap to rename')).toBeTruthy();
  });

  it('saves the new name', async () => {
    await mount();
    await fireEvent.press(await screen.findByText('Called "ISC" here — tap to rename'));
    const field = await screen.findByDisplayValue('ISC');
    await fireEvent.changeText(field, ' Site charges ');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockSetLabel).toHaveBeenCalledWith('Site charges'));
  });
});
