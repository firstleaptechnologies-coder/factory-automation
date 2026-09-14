import { fireEvent, render, screen } from '@testing-library/react-native';
import { ClientDetailScreen } from './ClientDetailScreen';

const mockClient = jest.fn();
const mockHistory = jest.fn();
const mockShareDocument = jest.fn(async (_options: unknown) => true);
jest.mock('../lib/documents', () => ({
  shareDocument: (options: unknown) => mockShareDocument(options),
}));

jest.mock('../api/client', () => ({
  api: {
    client: (...a: unknown[]) => mockClient(...a),
    history: (...a: unknown[]) => mockHistory(...a),
    clientStatementUrl: (id: string) => `http://api.test/clients/${id}/statement`,
  },
}));

const CLIENT = {
  id: 'c1',
  code: 'CLI-1',
  name: 'Verma Interiors',
  company: 'Verma & Sons',
  phone: '9820012345',
  gstin: '27AAAAA0000A1Z5',
  locations: [
    { id: 'loc1', name: 'Andheri West', address: 'Shop 4, Link Road', useCount: 3 },
  ],
  orders: [
    {
      id: 'o1',
      code: 'ORD-1',
      createdAt: '2026-09-06T10:00:00Z',
      status: { name: 'Cutting', color: '#FF6B1A' },
    },
  ],
};

const navigate = jest.fn();

async function mount(over: Record<string, unknown> = {}) {
  mockClient.mockResolvedValue({ ...CLIENT, ...over });
  await render(
    <ClientDetailScreen
      route={{ params: { clientId: 'c1' } }}
      navigation={{ navigate, goBack: jest.fn() }}
    />,
  );
  await screen.findByText('CLI-1');
}

beforeEach(() => jest.clearAllMocks());

it('shows who the client is', async () => {
  await mount();
  expect(screen.getByText('Verma Interiors')).toBeTruthy();
  expect(screen.getByText('Verma & Sons')).toBeTruthy();
  expect(screen.getByText('9820012345')).toBeTruthy();
});

it('lists the sites, with how often each has been used', async () => {
  await mount();
  // Remembering the site is what makes the next order to it a pick, not a retype.
  expect(screen.getByText('Andheri West')).toBeTruthy();
  expect(screen.getByText('Shop 4, Link Road')).toBeTruthy();
  expect(screen.getByText('×3')).toBeTruthy();
});

it('says nothing about sites for a client with none', async () => {
  await mount({ locations: [] });
  expect(screen.queryByText('Sites')).toBeNull();
});

it('lists the recent orders with their stage', async () => {
  await mount();
  expect(screen.getByText('ORD-1')).toBeTruthy();
  expect(screen.getByText('Cutting')).toBeTruthy();
});

it('says plainly when a client has given no work yet', async () => {
  await mount({ orders: [] });
  expect(screen.getByText('No orders yet.')).toBeTruthy();
});

it('opens the order that was tapped', async () => {
  await mount();
  await fireEvent.press(screen.getByText('ORD-1'));
  expect(navigate).toHaveBeenCalledWith('OrderDetail', { orderId: 'o1' });
});

it('opens the firm details', async () => {
  await mount();
  await fireEvent.press(screen.getByText('Firm details'));
  expect(navigate).toHaveBeenCalledWith('ClientFirm', { clientId: 'c1' });
});

it('shows what has been changed on the client', async () => {
  mockHistory.mockResolvedValue([
    {
      id: 'h1',
      at: '2026-09-08T10:00:00.000Z',
      kind: 'changed',
      action: 'client.updated',
      entity: 'Client',
      entityId: 'c1',
      by: 'Rajat',
      changes: [{ field: 'phone', from: '9820012345', to: '9820099999' }],
    },
  ]);
  await mount();
  expect(await screen.findByText('Phone changed')).toBeTruthy();
});

/*
 * The statement is paper for the client, so it is fetched and shared the way
 * every other document is.
 *
 * It used to be handed to the phone's browser as a URL, which carries no
 * session: the one screen for chasing money threw the shop out of the app and
 * showed them `{"message":"Unauthorized","statusCode":401}` in Safari.
 */
it('fetches the client’s statement with the session and shares it', async () => {
  await mount();

  await fireEvent.press(screen.getByText('Statement'));

  expect(mockShareDocument).toHaveBeenCalledWith(
    expect.objectContaining({ path: '/clients/c1/statement' }),
  );
});
