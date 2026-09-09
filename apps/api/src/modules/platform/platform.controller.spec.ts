import { PlatformController } from './platform.controller';

const platform = {
  list: jest.fn(async (..._a: unknown[]) => 'list'),
  create: jest.fn(async (..._a: unknown[]) => 'created'),
  update: jest.fn(async (..._a: unknown[]) => 'updated'),
  changeIsolation: jest.fn(async (..._a: unknown[]) => 'moved'),
};

const impersonation = { start: jest.fn(async (..._a: unknown[]) => ({ accessToken: 'tok' })) };
const subscriptions = {};
const staff = {
  roles: jest.fn(async (..._a: unknown[]) => 'roles'),
  saveRole: jest.fn(async (..._a: unknown[]) => 'role saved'),
  createRole: jest.fn(async (..._a: unknown[]) => 'role made'),
  deleteRole: jest.fn(async (..._a: unknown[]) => 'role gone'),
  staff: jest.fn(async (..._a: unknown[]) => 'staff'),
  createStaff: jest.fn(async (..._a: unknown[]) => 'person made'),
  saveStaff: jest.fn(async (..._a: unknown[]) => 'person saved'),
};
const controller = new PlatformController(
  platform as never,
  subscriptions as never,
  impersonation as never,
  staff as never,
);

beforeEach(() => jest.clearAllMocks());

it('lists every workspace on the platform', async () => {
  await controller.list();
  expect(platform.list).toHaveBeenCalled();
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


it('opens a workspace with the reason and who is asking', async () => {
  await controller.open('t1', { reason: 'Their board is not loading' } as never, {
    id: 'p1',
    name: 'Nakul',
  } as never);

  // The reason travels: it is written into that shop's own history.
  expect(impersonation.start).toHaveBeenCalledWith('t1', 'Their board is not loading', {
    id: 'p1',
    name: 'Nakul',
  });
});
