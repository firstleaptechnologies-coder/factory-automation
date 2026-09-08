import { VendorsController } from './vendors.controller';

const vendors = {
  list: jest.fn(async (..._a: unknown[]) => 'page'),
  get: jest.fn(async (..._a: unknown[]) => 'one'),
  create: jest.fn(async (..._a: unknown[]) => 'created'),
  update: jest.fn(async (..._a: unknown[]) => 'updated'),
  retire: jest.fn(async (..._a: unknown[]) => 'retired'),
};

const controller = new VendorsController(vendors as never);

beforeEach(() => jest.clearAllMocks());

it('records who added a vendor, from the session', async () => {
  await controller.create({ name: 'Verma Boards' } as never, { id: 'u9' } as never);
  expect(vendors.create).toHaveBeenCalledWith({ name: 'Verma Boards' }, 'u9');
});

it('retires rather than deletes', async () => {
  // Every purchase ever placed hangs off the row.
  await controller.retire('v1');
  expect(vendors.retire).toHaveBeenCalledWith('v1');
});
