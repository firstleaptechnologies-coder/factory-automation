import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { monthBounds, shiftMonth, thisMonth } from '@decor/shared';
import { WasteScreen } from './WasteScreen';

const mockWaste = jest.fn();
jest.mock('../api/client', () => ({
  api: { wasteReport: (...a: unknown[]) => mockWaste(...a) },
}));

const ROW = {
  material: { id: 'm1', code: 'PLY', name: 'Plywood', stockUnit: 'sheet' },
  consumed: 10,
  offcut: 2,
  wasted: 1.5,
  wastePct: 15,
};

const navigation = { goBack: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockWaste.mockResolvedValue({
    from: '2026-09-01',
    to: '2026-09-30',
    rows: [ROW],
    totals: { consumed: 10, offcut: 2, wasted: 1.5, wastePct: 15 },
  });
});

const mount = async () => {
  await render(<WasteScreen navigation={navigation as never} />);
  await waitFor(() => expect(mockWaste).toHaveBeenCalled());
};

it('asks for this month, in local days', async () => {
  await mount();
  expect(mockWaste).toHaveBeenCalledWith(monthBounds(thisMonth()));
});

it('leads with the share of what was issued, not of what was bought', async () => {
  await mount();
  // A shop that buys a hundred sheets and cuts ten has wasted a share of ten.
  expect(await screen.findByText('15% of what was issued')).toBeTruthy();
});

it('says what was issued and what came back as offcut', async () => {
  await mount();
  expect(await screen.findByText('10 issued · 2 back as offcut')).toBeTruthy();
});

it('steps to another month without typing', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('next-month'));
  await waitFor(() =>
    expect(mockWaste).toHaveBeenLastCalledWith(monthBounds(shiftMonth(thisMonth(), 1))),
  );
});

it('says so plainly when nothing was cut', async () => {
  mockWaste.mockResolvedValue({
    from: '2026-09-01',
    to: '2026-09-30',
    rows: [],
    totals: { consumed: 0, offcut: 0, wasted: 0, wastePct: 0 },
  });
  await mount();
  expect(await screen.findByText('Nothing was cut this month')).toBeTruthy();
});
