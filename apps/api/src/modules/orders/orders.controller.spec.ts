import { OrdersController } from './orders.controller';
import { DEFAULT_UNIT } from '@fas/shared';

const orders = {
  list: jest.fn(async (..._a: unknown[]) => 'list'),
  board: jest.fn(async (..._a: unknown[]) => 'board'),
  findOne: jest.fn(async (..._a: unknown[]) => 'one'),
  punch: jest.fn(async (..._a: unknown[]) => 'punched'),
  update: jest.fn(async (..._a: unknown[]) => 'updated'),
  reprice: jest.fn(async (..._a: unknown[]) => 'repriced'),
  changeStatus: jest.fn(async (..._a: unknown[]) => 'moved'),
  addAttachments: jest.fn(async (..._a: unknown[]) => 'attached'),
  removeAttachment: jest.fn(async (..._a: unknown[]) => 'removed'),
};

const controller = new OrdersController(orders as never);
const USER = { id: 'u1', code: 'ADMIN', role: 'ADMIN', permissions: [] } as never;

beforeEach(() => jest.clearAllMocks());

it('passes the query through to the service', async () => {
  await controller.list({ page: 2 } as never);
  expect(orders.list).toHaveBeenCalledWith({ page: 2 });
});

it('asks for a particular workflow’s board when one is named', async () => {
  await controller.board('w1');
  expect(orders.board).toHaveBeenCalledWith('w1');
});

describe('the unit an order is read in', () => {
  it('is whatever the caller asked for', async () => {
    await controller.findOne('o1', 'MM');
    expect(orders.findOne).toHaveBeenCalledWith('o1', 'MM');
  });

  it('falls back to the default rather than failing on nonsense', async () => {
    await controller.findOne('o1', 'furlongs');
    // A bad query string should not turn a readable order into an error.
    expect(orders.findOne).toHaveBeenCalledWith('o1', DEFAULT_UNIT);
  });

  it('falls back when none was given at all', async () => {
    await controller.findOne('o1');
    expect(orders.findOne).toHaveBeenCalledWith('o1', DEFAULT_UNIT);
  });

  it('applies to punching too, since the sizes come back priced', async () => {
    await controller.punch({} as never, USER, 'FT');
    expect(orders.punch).toHaveBeenCalledWith({}, 'u1', 'FT');
  });
});

it('records who punched an order', async () => {
  await controller.punch({ location: 'Andheri' } as never, USER);
  expect(orders.punch).toHaveBeenCalledWith({ location: 'Andheri' }, 'u1', DEFAULT_UNIT);
});

it('copes with an unauthenticated punch rather than throwing on the user', async () => {
  await controller.punch({} as never, undefined as never);
  expect(orders.punch).toHaveBeenCalledWith({}, undefined, DEFAULT_UNIT);
});

it('re-states the terms on an order that is already punched', async () => {
  // A client who cannot take a GST bill usually says so afterwards.
  await controller.reprice('o1', { taxTreatment: 'ABSORBED' } as never);
  expect(orders.reprice).toHaveBeenCalledWith('o1', { taxTreatment: 'ABSORBED' });
});

it('carries who moved an order, for the history', async () => {
  await controller.changeStatus('o1', { toStatusId: 's2' } as never, USER);
  expect(orders.changeStatus).toHaveBeenCalledWith('o1', { toStatusId: 's2' }, USER);
});

it('passes the uploaded files and what they are for', async () => {
  const files = [{ originalname: 'a.jpg' }] as never;
  await controller.addAttachments('o1', files, { kind: 'SIZE_IMAGE' } as never, USER);
  expect(orders.addAttachments).toHaveBeenCalledWith('o1', files, { kind: 'SIZE_IMAGE' }, 'u1');
});

it('removes an attachment by its own id, not the order’s', async () => {
  await controller.removeAttachment('a1');
  expect(orders.removeAttachment).toHaveBeenCalledWith('a1');
});

it('updates an order', async () => {
  await controller.update('o1', { location: 'Bandra' } as never);
  expect(orders.update).toHaveBeenCalledWith('o1', { location: 'Bandra' });
});
