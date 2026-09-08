import { fireEvent, render, screen } from '@testing-library/react-native';
import { NotificationsScreen } from './NotificationsScreen';

const mockFeed = jest.fn();
const mockRead = jest.fn();
const mockReadAll = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    notifications: (...a: unknown[]) => mockFeed(...a),
    readNotification: (...a: unknown[]) => mockRead(...a),
    readAllNotifications: (...a: unknown[]) => mockReadAll(...a),
  },
}));

const goBack = jest.fn();
const navigate = jest.fn();

const item = (over: Record<string, unknown> = {}) => ({
  id: 'n1',
  kind: 'order.moved',
  title: 'ORD-1 → Cutting',
  body: 'Rajat moved ORD-1 to Cutting for Verma Interiors.',
  entity: 'Order',
  entityId: 'o1',
  readAt: null,
  createdAt: '2026-09-08T10:00:00.000Z',
  ...over,
});

const mount = async (items: unknown[] = [], unread = 0) => {
  mockFeed.mockResolvedValue({ items, unread });
  await render(<NotificationsScreen navigation={{ goBack, navigate }} />);
  await screen.findByText('Notifications');
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRead.mockResolvedValue({ read: 1 });
  mockReadAll.mockResolvedValue({ read: 3 });
});

it('says there is nothing to catch up on yet', async () => {
  await mount();
  expect(await screen.findByText('Nothing yet')).toBeTruthy();
  expect(screen.getByText('All caught up')).toBeTruthy();
});

it('shows what happened, and how long ago', async () => {
  await mount([item()], 1);
  expect(await screen.findByText('ORD-1 → Cutting')).toBeTruthy();
  expect(screen.getByText(/Rajat moved ORD-1/)).toBeTruthy();
  expect(screen.getByText('1 unread')).toBeTruthy();
});

it('opens the thing it is about', async () => {
  await mount([item()], 1);
  await fireEvent.press(await screen.findByText('ORD-1 → Cutting'));
  expect(navigate).toHaveBeenCalledWith('OrderDetail', { orderId: 'o1' });
});

it('counts it as read on the way there', async () => {
  await mount([item()], 1);
  await fireEvent.press(await screen.findByText('ORD-1 → Cutting'));
  // The tap is the reading; a failed request should not stop the screen it was
  // about from opening.
  expect(mockRead).toHaveBeenCalledWith('n1');
});

it('does not re-read one that was already read', async () => {
  await mount([item({ readAt: '2026-09-08T11:00:00.000Z' })], 0);
  await fireEvent.press(await screen.findByText('ORD-1 → Cutting'));
  expect(mockRead).not.toHaveBeenCalled();
});

it('opens an enquiry, when that is what it was about', async () => {
  await mount([item({ entity: 'Lead', entityId: 'l1' })], 1);
  await fireEvent.press(await screen.findByText('ORD-1 → Cutting'));
  expect(navigate).toHaveBeenCalledWith('LeadDetail', { leadId: 'l1' });
});

it('clears the lot', async () => {
  await mount([item()], 1);
  await fireEvent.press(await screen.findByText('Mark all read'));
  expect(mockReadAll).toHaveBeenCalled();
});

it('offers no "mark all" when there is nothing unread', async () => {
  await mount([item({ readAt: '2026-09-08T11:00:00.000Z' })], 0);
  await screen.findByText('All caught up');
  expect(screen.queryByText('Mark all read')).toBeNull();
});

it('goes back', async () => {
  await mount();
  await fireEvent.press(screen.getByLabelText('Back'));
  expect(goBack).toHaveBeenCalled();
});
