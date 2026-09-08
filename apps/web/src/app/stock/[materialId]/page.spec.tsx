import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { PERMISSIONS } from '@decor/shared';
import StockMovesPage from './page';

const apiMock = { stockMoves: jest.fn(), stockLevels: jest.fn(), recordStockMove: jest.fn() };
jest.mock('@/lib/api', () => ({
  api: new Proxy(
    {},
    {
      get: (_t, key: string) => (...args: never[]) =>
        (apiMock[key as keyof typeof apiMock] as (...a: never[]) => unknown)(...args),
    },
  ),
}));

let permissions: string[] = [];
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ can: (p: string) => permissions.includes(p) }),
}));

jest.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

beforeEach(() => {
  jest.clearAllMocks();
  permissions = [PERMISSIONS.STOCK_VIEW, PERMISSIONS.STOCK_MOVE];
  apiMock.stockMoves.mockResolvedValue([MOVE]);
  apiMock.stockLevels.mockResolvedValue({
    rows: [
      { material: MATERIAL, quantity: 6, value: 5400, averageRate: 900, low: false, byThickness: [] },
    ],
    totals: { value: 5400, low: 0 },
  });
  apiMock.recordStockMove.mockResolvedValue(MOVE);
});

const mount = async () => {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <StockMovesPage params={Promise.resolve({ materialId: 'm1' })} />
      </Suspense>,
    );
  });
};

const triggers = () => [...document.querySelectorAll('.select-trigger')] as HTMLElement[];

it('says what happened and why, with who recorded it', async () => {
  await mount();
  expect(await screen.findByText('Wasted')).toBeInTheDocument();
  expect(screen.getByText('Board split on the saw')).toBeInTheDocument();
  expect(screen.getByText('Nakul')).toBeInTheDocument();
});

it('offers no way to record a delivery', async () => {
  await mount();
  fireEvent.click(await screen.findByText('Record a move'));
  fireEvent.click(triggers()[0]);
  // Stock arrives against a purchase, so everything on the rack has a bill.
  expect(screen.queryByRole('option', { name: /Arrived/ })).toBeNull();
  expect(await screen.findByRole('option', { name: /Issued/ })).toBeInTheDocument();
});

it('will not record waste without a reason', async () => {
  await mount();
  fireEvent.click(await screen.findByText('Record a move'));
  fireEvent.click(triggers()[0]);
  fireEvent.click(await screen.findByRole('option', { name: /Wasted/ }));
  fireEvent.change(screen.getByLabelText(/How many/), { target: { value: '2' } });
  // A sheet that vanished with no reason beside it is the thing this is for.
  expect(screen.getByRole('button', { name: 'Record it' })).toBeDisabled();
});

it('records it once there is a reason', async () => {
  await mount();
  fireEvent.click(await screen.findByText('Record a move'));
  fireEvent.click(triggers()[0]);
  fireEvent.click(await screen.findByRole('option', { name: /Wasted/ }));
  fireEvent.change(screen.getByLabelText(/How many/), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText(/Why/), {
    target: { value: 'Board split on the saw' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Record it' }));
  await waitFor(() =>
    expect(apiMock.recordStockMove).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'WASTE', quantity: 2, reason: 'Board split on the saw' }),
    ),
  );
});

it('says why a move was refused, rather than nothing', async () => {
  apiMock.recordStockMove.mockRejectedValue(new Error('There is only 1 sheet on the rack.'));
  await mount();
  fireEvent.click(await screen.findByText('Record a move'));
  fireEvent.change(screen.getByLabelText(/How many/), { target: { value: '9' } });
  fireEvent.click(screen.getByRole('button', { name: 'Record it' }));
  expect(await screen.findByText('There is only 1 sheet on the rack.')).toBeInTheDocument();
});

it('offers recording nothing to somebody who may only look', async () => {
  permissions = [PERMISSIONS.STOCK_VIEW];
  await mount();
  expect(screen.queryByText('Record a move')).toBeNull();
});
