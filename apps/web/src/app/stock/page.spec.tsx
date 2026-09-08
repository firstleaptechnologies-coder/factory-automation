import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StockPage from './page';

const apiMock = { stockLevels: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: never[]) =>
        (apiMock[key as keyof typeof apiMock] as (...a: never[]) => unknown)(...args),
    },
  ),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ROW = {
  material: {
    id: 'm1',
    code: 'PLY',
    name: 'Plywood',
    color: '#C4A484',
    stockUnit: 'sheet',
    reorderLevel: 4,
  },
  quantity: 3,
  value: 2700,
  averageRate: 900,
  low: true,
  byThickness: [
    { thickness: { id: 't1', valueMm: 18, label: null }, quantity: 2 },
    { thickness: { id: 't2', valueMm: 6, label: null }, quantity: 1 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.stockLevels.mockResolvedValue({ rows: [ROW], totals: { value: 2700, low: 1 } });
});

const mount = async () => {
  render(<StockPage />);
  await screen.findByText('Stock');
};

it('leads with what the rack is worth', async () => {
  await mount();
  // Once in the heading and once on the only material under it.
  await waitFor(() => expect(screen.getAllByText('₹2,700')).toHaveLength(2));
  expect(screen.getByText('1 material needs ordering')).toBeInTheDocument();
});

it('breaks it down by thickness, because 18mm is not 6mm', async () => {
  await mount();
  expect(await screen.findByText('18mm: 2 · 6mm: 1')).toBeInTheDocument();
});

it('says which materials need ordering', async () => {
  await mount();
  expect(await screen.findByText('Order more')).toBeInTheDocument();
});

it('can be asked for only what needs ordering', async () => {
  await mount();
  fireEvent.click(screen.getByText('Needs ordering'));
  await waitFor(() =>
    expect(apiMock.stockLevels).toHaveBeenLastCalledWith(
      expect.objectContaining({ lowOnly: true }),
    ),
  );
});

it('opens the story of one material', async () => {
  await mount();
  fireEvent.click(await screen.findByText('Plywood'));
  expect(push).toHaveBeenCalledWith('/stock/m1');
});
