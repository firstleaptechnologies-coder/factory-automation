import { act, render, screen, fireEvent } from '@testing-library/react';
import NotificationsPage from './page';

const apiMock: Record<string, jest.Mock> = {
  notifications: jest.fn(),
  readNotification: jest.fn(),
  readAllNotifications: jest.fn(),
  unreadNotifications: jest.fn(),
};
jest.mock('@/lib/api', () => ({
  api: new Proxy({}, { get: (_t, key: string) => (...args: unknown[]) => apiMock[key](...args) }),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/notifications' }));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

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

const open = async (items: unknown[] = [], unread = 0) => {
  apiMock.notifications.mockResolvedValue({ items, unread });
  await act(async () => {
    render(<NotificationsPage />);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.readNotification.mockResolvedValue({ read: 1 });
  apiMock.readAllNotifications.mockResolvedValue({ read: 2 });
  apiMock.unreadNotifications.mockResolvedValue({ unread: 0 });
});

describe('the list', () => {
  it('says there is nothing to catch up on yet', async () => {
    await open();
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
    expect(screen.getByText('All caught up')).toBeInTheDocument();
  });

  it('shows what happened', async () => {
    await open([item()], 1);
    expect(screen.getByText('ORD-1 → Cutting')).toBeInTheDocument();
    expect(screen.getByText(/Rajat moved ORD-1/)).toBeInTheDocument();
    expect(screen.getByText('1 unread')).toBeInTheDocument();
  });

  it('marks the unread ones, without a wall of colour', async () => {
    await open([item(), item({ id: 'n2', readAt: '2026-09-08T11:00:00.000Z' })], 1);
    expect(screen.getAllByTestId('unread')).toHaveLength(1);
    expect(screen.getAllByTestId('read')).toHaveLength(1);
  });

  it('opens the thing it is about, and counts it read on the way', async () => {
    await open([item()], 1);
    await act(async () => {
      fireEvent.click(screen.getByText('ORD-1 → Cutting'));
    });

    expect(push).toHaveBeenCalledWith('/orders/o1');
    expect(apiMock.readNotification).toHaveBeenCalledWith('n1');
  });

  it('opens a quote, when that is what it was about', async () => {
    await open([item({ entity: 'Estimate', entityId: 'e1' })], 1);
    await act(async () => {
      fireEvent.click(screen.getByText('ORD-1 → Cutting'));
    });
    expect(push).toHaveBeenCalledWith('/quotes/e1');
  });

  it('does not re-read one that was already read', async () => {
    await open([item({ readAt: '2026-09-08T11:00:00.000Z' })], 0);
    await act(async () => {
      fireEvent.click(screen.getByText('ORD-1 → Cutting'));
    });
    expect(apiMock.readNotification).not.toHaveBeenCalled();
  });

  it('clears the lot', async () => {
    await open([item()], 1);
    await act(async () => {
      fireEvent.click(screen.getByText('Mark all read'));
    });
    expect(apiMock.readAllNotifications).toHaveBeenCalled();
  });

  it('offers no "mark all" when there is nothing unread', async () => {
    await open([item({ readAt: '2026-09-08T11:00:00.000Z' })], 0);
    expect(screen.queryByText('Mark all read')).not.toBeInTheDocument();
  });
});
