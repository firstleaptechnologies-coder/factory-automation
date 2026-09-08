import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StockScreen } from './StockScreen';

const mockLevels = jest.fn();
jest.mock('../api/client', () => ({
  api: { stockLevels: (...a: unknown[]) => mockLevels(...a) },
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

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockLevels.mockResolvedValue({ rows: [ROW], totals: { value: 2700, low: 1 } });
});

const mount = async () => {
  await render(<StockScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockLevels).toHaveBeenCalled());
};

it('leads with what the rack is worth', async () => {
  await mount();
  expect(await screen.findByText('₹2,700')).toBeTruthy();
  expect(screen.getByText('1 material needs ordering')).toBeTruthy();
});

it('says how much of each material there is, in its own unit', async () => {
  await mount();
  expect(await screen.findByText('3 sheet')).toBeTruthy();
  expect(screen.getByText('Order more')).toBeTruthy();
});

it('breaks it down by thickness, because 18mm is not 6mm', async () => {
  await mount();
  // A single figure would say the two were interchangeable.
  expect(await screen.findByText('18mm: 2 · 6mm: 1')).toBeTruthy();
});

it('can be asked for only what needs ordering', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('low-only'));
  await waitFor(() =>
    expect(mockLevels).toHaveBeenLastCalledWith(expect.objectContaining({ lowOnly: true })),
  );
});

it('opens the story of one material', async () => {
  await mount();
  await fireEvent.press(await screen.findByText('Plywood'));
  expect(navigation.navigate).toHaveBeenCalledWith('StockMoves', { materialId: 'm1' });
});

it('says stock arrives against a purchase when there is none', async () => {
  mockLevels.mockResolvedValue({ rows: [], totals: { value: 0, low: 0 } });
  await mount();
  expect(await screen.findByText('Stock arrives against a purchase')).toBeTruthy();
});
