import { PlatformController } from './platform.controller';

const platform = {
  list: jest.fn(async (..._a: unknown[]) => 'list'),
  findOne: jest.fn(async (..._a: unknown[]) => 'one'),
  create: jest.fn(async (..._a: unknown[]) => 'created'),
  update: jest.fn(async (..._a: unknown[]) => 'updated'),
  changeIsolation: jest.fn(async (..._a: unknown[]) => 'moved'),
};

const controller = new PlatformController(platform as never);

beforeEach(() => jest.clearAllMocks());

it('lists every workspace on the platform', async () => {
  await controller.list();
  expect(platform.list).toHaveBeenCalled();
});

it('reads one workspace', async () => {
  await controller.findOne('t1');
  expect(platform.findOne).toHaveBeenCalledWith('t1');
});

it('provisions a workspace with the owner who will sign in first', async () => {
  const dto = { slug: 'woodcraft', name: 'Woodcraft', ownerName: 'Anil', ownerPassword: 'x' };
  await controller.create(dto as never);
  expect(platform.create).toHaveBeenCalledWith(dto);
});

it('edits a workspace', async () => {
  await controller.update('t1', { status: 'SUSPENDED' } as never);
  expect(platform.update).toHaveBeenCalledWith('t1', { status: 'SUSPENDED' });
});

it('moves a workspace between a shared database and its own', async () => {
  // Its own route, because it moves data rather than editing a row.
  const dto = { isolation: 'DEDICATED', databaseUrl: 'postgres://host/db' };
  await controller.changeIsolation('t1', dto as never);
  expect(platform.changeIsolation).toHaveBeenCalledWith('t1', dto);
});
