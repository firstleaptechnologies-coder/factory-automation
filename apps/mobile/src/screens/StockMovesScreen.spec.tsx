import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PERMISSIONS } from '@fas/shared';
import { StockMovesScreen } from './StockMovesScreen';

const mockMoves = jest.fn();
const mockLevels = jest.fn();
const mockRecord = jest.fn();
jest.mock('../api/client', () => ({
  api: {
    stockMoves: (...a: unknown[]) => mockMoves(...a),
    stockLevels: (...a: unknown[]) => mockLevels(...a),
    recordStockMove: (...a: unknown[]) => mockRecord(...a),
  },
}));

let mockPermissions: string[] = [];
jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => mockPermissions.includes(p) }),
}));

const MATERIAL = { id: 'm1', code: 'PLY', name: 'Plywood', stockUnit: 'sheet' };

const MOVE = {
  id: 's1',
  materialId: 'm1',
  material: MATERIAL,
  kind: 'WASTE',
  quantity: -1.5,
  unit: 'sheet',
  reason: 'Board split on the saw',
  at: '2026-09-09',
  recordedBy: { id: 'u1', name: 'Nakul' },
};

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [PERMISSIONS.STOCK_VIEW, PERMISSIONS.STOCK_MOVE];
  mockMoves.mockResolvedValue([MOVE]);
  mockLevels.mockResolvedValue({
    rows: [{ material: MATERIAL, quantity: 6, value: 5400, averageRate: 900, low: false, byThickness: [] }],
    totals: { value: 5400, low: 0 },
  });
  mockRecord.mockResolvedValue(MOVE);
});

/**
 * The option inside the open list.
 *
 * The trigger shows the chosen value too, so the same word is on screen twice
 * and the one in the list is rendered last.
 */
const option = async (label: string) => {
  const found = await screen.findAllByText(label);
  return found[found.length - 1];
};

const mount = async () => {
  await render(
    <StockMovesScreen
      navigation={navigation as never}
      route={{ params: { materialId: 'm1' } } as never}
    />,
  );
  await waitFor(() => expect(mockMoves).toHaveBeenCalled());
};

it('says what happened and why, with who recorded it', async () => {
  await mount();
  expect(await screen.findByText('Wasted')).toBeTruthy();
  expect(screen.getByText('“Board split on the saw”')).toBeTruthy();
  expect(screen.getByText(/Nakul/)).toBeTruthy();
});

it('offers no way to record a delivery', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('record-move'));
  await fireEvent(screen.getAllByTestId('select-trigger')[0], 'touchEnd');
  // Stock arrives against a purchase, so everything on the rack has a bill.
  expect(screen.queryByText('Arrived')).toBeNull();
  expect(await option('Issued')).toBeTruthy();
});

it('will not record waste without a reason', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('record-move'));
  await fireEvent(screen.getAllByTestId('select-trigger')[0], 'touchEnd');
  await fireEvent.press(await option('Wasted'));
  await fireEvent.changeText(screen.getByPlaceholderText('0'), '2');
  await fireEvent.press(screen.getByText('Record it'));
  // A sheet that vanished with no reason beside it is the thing this is for.
  expect(mockRecord).not.toHaveBeenCalled();
});

it('records it once there is a reason', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('record-move'));
  await fireEvent(screen.getAllByTestId('select-trigger')[0], 'touchEnd');
  await fireEvent.press(await option('Wasted'));
  await fireEvent.changeText(screen.getByPlaceholderText('0'), '2');
  await fireEvent.changeText(
    screen.getByPlaceholderText('Board split on the saw'),
    'Board split on the saw',
  );
  await fireEvent.press(screen.getByText('Record it'));
  await waitFor(() =>
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        materialId: 'm1',
        kind: 'WASTE',
        quantity: 2,
        reason: 'Board split on the saw',
      }),
    ),
  );
});

it('lets an offcut through without one', async () => {
  await mount();
  await fireEvent.press(screen.getByTestId('record-move'));
  await fireEvent(screen.getAllByTestId('select-trigger')[0], 'touchEnd');
  await fireEvent.press(await option('Offcut back'));
  await fireEvent.changeText(screen.getByPlaceholderText('0'), '1.5');
  await fireEvent.press(screen.getByText('Record it'));
  await waitFor(() =>
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'OFFCUT', quantity: 1.5 }),
    ),
  );
});

it('offers recording nothing to somebody who may only look', async () => {
  mockPermissions = [PERMISSIONS.STOCK_VIEW];
  await mount();
  expect(screen.queryByTestId('record-move')).toBeNull();
});
