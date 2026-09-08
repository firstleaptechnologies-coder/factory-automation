import { UsersController } from './users.controller';

const users = {
  list: jest.fn(async (..._a: unknown[]) => 'list'),
  findOne: jest.fn(async (..._a: unknown[]) => 'one'),
  create: jest.fn(async (..._a: unknown[]) => 'created'),
  update: jest.fn(async (..._a: unknown[]) => 'updated'),
  changePassword: jest.fn(async (..._a: unknown[]) => 'changed'),
};

const controller = new UsersController(users as never);

beforeEach(() => jest.clearAllMocks());

it('lists the workspace’s people', async () => {
  await controller.list();
  expect(users.list).toHaveBeenCalled();
});

it('reads one', async () => {
  await controller.findOne('u1');
  expect(users.findOne).toHaveBeenCalledWith('u1');
});

it('adds one', async () => {
  const dto = { code: 'SALES02', name: 'Priya', password: 'secret' };
  await controller.create(dto as never);
  expect(users.create).toHaveBeenCalledWith(dto);
});

it('edits one', async () => {
  await controller.update('u1', { name: 'Priya S' } as never);
  expect(users.update).toHaveBeenCalledWith('u1', { name: 'Priya S' });
});

it('changes a password on its own route, not through the general edit', async () => {
  // Kept apart so a password can never be set as a side effect of an edit.
  await controller.changePassword('u1', { password: 'newsecret' } as never);
  expect(users.changePassword).toHaveBeenCalledWith('u1', { password: 'newsecret' });
  expect(users.update).not.toHaveBeenCalled();
});
