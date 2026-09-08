import { render, screen, waitFor } from '@testing-library/react-native';
import { InvoicesScreen } from './InvoicesScreen';

const mockInvoices = jest.fn();
jest.mock('../api/client', () => ({
  api: { invoices: (...a: unknown[]) => mockInvoices(...a) },
}));

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

const ROWS = [
  {
    id: 'i1',
    code: 'INV-2627-0001',
    status: 'ISSUED',
    clientName: 'Verma Interiors',
    order: { id: 'o1', code: 'ORD-2627-0007' },
    issuedOn: '2026-09-09',
    total: '11800',
  },
  {
    id: 'i2',
    code: 'INV-2627-0002',
    status: 'CANCELLED',
    clientName: 'Sharma Builders',
    order: { id: 'o2', code: 'ORD-2627-0008' },
    issuedOn: '2026-09-08',
    total: '5000',
  },
];

const mount = async (rows: unknown = ROWS) => {
  mockInvoices.mockResolvedValue(rows);
  render(<InvoicesScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockInvoices).toHaveBeenCalled());
};

beforeEach(() => jest.clearAllMocks());

it('lists what was billed, and what it was billed against', async () => {
  await mount();
  expect(await screen.findByText('INV-2627-0001')).toBeTruthy();
  expect(screen.getByText('Verma Interiors · ORD-2627-0007')).toBeTruthy();
});

it('counts nothing a cancelled invoice claimed', async () => {
  await mount();
  // A cancelled invoice keeps its number and claims nothing. Adding it to the
  // total would overstate the month's billing by a document that is void.
  // Twice: the hero total, and the one issued row it came from.
  await waitFor(() => expect(screen.getAllByText('₹11,800')).toHaveLength(2));
  expect(screen.queryByText('₹16,800')).toBeNull();
});

it('says which of them is void, on the row itself', async () => {
  await mount();
  expect(await screen.findByText('Cancelled')).toBeTruthy();
  expect(screen.getByText('Issued')).toBeTruthy();
});

it('says nothing has been billed rather than showing an empty list', async () => {
  await mount([]);
  expect(await screen.findByText('Nothing billed yet')).toBeTruthy();
});
