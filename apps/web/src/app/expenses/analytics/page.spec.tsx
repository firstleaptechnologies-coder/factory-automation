import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExpenseAnalyticsPage from './page';
import { windowStart } from './windows';

const apiMock = { expenseAnalytics: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: unknown[]) =>
        apiMock[key as keyof typeof apiMock](...args),
    },
  ),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const DATA = {
  total: 128000,
  count: 24,
  monthly: [{ month: '2026-09', amount: 128000 }],
  bySpentType: [
    { label: 'Raw material', amount: 90000, count: 10 },
    { label: 'Rent', amount: 38000, count: 2 },
  ],
  byDoneBy: [{ label: 'Nakul', amount: 128000, count: 24 }],
  byPaymentType: [{ label: 'UPI', amount: 128000, count: 24 }],
  byVendor: [],
  byToName: [{ label: 'Verma Ply', amount: 90000, count: 10 }],
};

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.expenseAnalytics.mockResolvedValue(DATA);
});

const mount = async (data: unknown = DATA) => {
  apiMock.expenseAnalytics.mockResolvedValue(data);
  render(<ExpenseAnalyticsPage />);
  await waitFor(() => expect(apiMock.expenseAnalytics).toHaveBeenCalled());
};

it('opens on this year rather than on everything ever', async () => {
  await mount();
  // A shop asking where its money went nearly always means this year.
  expect(apiMock.expenseAnalytics).toHaveBeenCalledWith({
    from: `${new Date().getFullYear()}-01-01`,
  });
});

it('asks for all time with no date at all', async () => {
  await mount();
  fireEvent.click(await screen.findByText('All time'));
  await waitFor(() =>
    expect(apiMock.expenseAnalytics).toHaveBeenLastCalledWith({ from: undefined }),
  );
});

it('works out each window from the first of the period', () => {
  const now = new Date('2026-09-08T18:00:00Z');
  expect(windowStart('all', now)).toBeUndefined();
  expect(windowStart('year', now)).toBe('2026-01-01');
  expect(windowStart('month', now)).toBe('2026-09-01');
});

it('puts the biggest bucket first, because that is the one to look at', async () => {
  await mount();
  expect(await screen.findByText('By category')).toBeInTheDocument();
  const labels = screen.getAllByText(/Raw material|Rent/).map((node) => node.textContent);
  expect(labels[0]).toBe('Raw material');
});

it('leaves out a cut with nothing in it', async () => {
  await mount();
  // Nothing was attributed to anyone but the shop, so an empty chart would be
  // a heading with a blank under it.
  expect(screen.queryByText('By who it was attributed to')).toBeNull();
});

it('says so plainly when nothing was spent in the window', async () => {
  await mount({ ...DATA, count: 0, total: 0 });
  expect(await screen.findByText('Nothing spent in this window')).toBeInTheDocument();
});
