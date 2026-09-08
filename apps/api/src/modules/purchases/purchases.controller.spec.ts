import { PurchasesController } from './purchases.controller';

const purchases = {
  list: jest.fn(async (..._a: unknown[]) => 'page'),
  get: jest.fn(async (..._a: unknown[]) => 'one'),
  create: jest.fn(async (..._a: unknown[]) => 'created'),
  update: jest.fn(async (..._a: unknown[]) => 'updated'),
  place: jest.fn(async (..._a: unknown[]) => 'placed'),
  receive: jest.fn(async (..._a: unknown[]) => 'received'),
  bill: jest.fn(async (..._a: unknown[]) => 'billed'),
  pay: jest.fn(async (..._a: unknown[]) => 'paid'),
  cancel: jest.fn(async (..._a: unknown[]) => 'cancelled'),
};

const stock = {
  levels: jest.fn(async (..._a: unknown[]) => 'levels'),
  waste: jest.fn(async (..._a: unknown[]) => 'waste'),
  moves: jest.fn(async (..._a: unknown[]) => 'moves'),
  record: jest.fn(async (..._a: unknown[]) => 'recorded'),
};

const controller = new PurchasesController(purchases as never, stock as never);

beforeEach(() => jest.clearAllMocks());

it('records who received a delivery and who moved stock, from the session', async () => {
  await controller.receive('p1', { lines: [] } as never, { id: 'u9' } as never);
  await controller.record({ materialId: 'm1' } as never, { id: 'u9' } as never);
  expect(purchases.receive).toHaveBeenCalledWith('p1', { lines: [] }, 'u9');
  expect(stock.record).toHaveBeenCalledWith({ materialId: 'm1' }, 'u9');
});

it('keeps ordering, billing and paying as three separate acts', async () => {
  await controller.place('p1');
  await controller.bill('p1', { billNumber: 'VB/1', billedOn: '2026-09-09' } as never);
  await controller.pay('p1', { mode: 'CASH' } as never, { id: 'u9' } as never);
  expect(purchases.place).toHaveBeenCalledWith('p1');
  expect(purchases.bill).toHaveBeenCalledWith('p1', {
    billNumber: 'VB/1',
    billedOn: '2026-09-09',
  });
  expect(purchases.pay).toHaveBeenCalledWith('p1', { mode: 'CASH' }, 'u9');
});

it('asks the stock service for the rack and for the waste', async () => {
  await controller.levels({ lowOnly: 'true' } as never);
  await controller.waste({ from: '2026-09-01', to: '2026-09-30' } as never);
  await controller.moves('m1');
  expect(stock.levels).toHaveBeenCalledWith({ lowOnly: 'true' });
  expect(stock.waste).toHaveBeenCalledWith({ from: '2026-09-01', to: '2026-09-30' });
  expect(stock.moves).toHaveBeenCalledWith('m1');
});
