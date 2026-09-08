import { RolesController } from './roles.controller';

const roles = {
  list: jest.fn(async () => 'roles'),
  create: jest.fn(async (..._a: unknown[]) => 'created'),
  update: jest.fn(async (..._a: unknown[]) => 'updated'),
  remove: jest.fn(async (..._a: unknown[]) => 'removed'),
  assign: jest.fn(async (..._a: unknown[]) => 'assigned'),
};

const controller = new RolesController(roles as never);

beforeEach(() => jest.clearAllMocks());

it('lists, writes and removes a role', async () => {
  await controller.list();
  await controller.create({ name: 'Accountant', permissions: [] } as never);
  await controller.update('r1', { name: 'Accountant', permissions: [] } as never);
  await controller.remove('r1');
  expect(roles.list).toHaveBeenCalled();
  expect(roles.create).toHaveBeenCalledWith({ name: 'Accountant', permissions: [] });
  expect(roles.update).toHaveBeenCalledWith('r1', { name: 'Accountant', permissions: [] });
  expect(roles.remove).toHaveBeenCalledWith('r1');
});

it('puts somebody on a role by their own id', async () => {
  await controller.assign('u1', { roleId: 'r1' });
  expect(roles.assign).toHaveBeenCalledWith('u1', { roleId: 'r1' });
});
