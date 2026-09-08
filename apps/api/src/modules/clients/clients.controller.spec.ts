import { ClientsController } from './clients.controller';

const clients = {
  list: jest.fn(async (..._a: unknown[]) => 'list'),
  search: jest.fn(async (..._a: unknown[]) => 'search'),
  findOne: jest.fn(async (..._a: unknown[]) => 'one'),
  create: jest.fn(async (..._a: unknown[]) => 'created'),
  update: jest.fn(async (..._a: unknown[]) => 'updated'),
  addLocation: jest.fn(async (..._a: unknown[]) => 'located'),
};

const controller = new ClientsController(clients as never);
const USER = { id: 'u1', code: 'SALES01', role: 'SALES', permissions: [] } as never;

beforeEach(() => jest.clearAllMocks());

it('passes the query through', async () => {
  await controller.list({ search: 'verma' } as never);
  expect(clients.list).toHaveBeenCalledWith({ search: 'verma' });
});

it('searches on whatever the punch screen has typed so far', async () => {
  await controller.search('ver');
  expect(clients.search).toHaveBeenCalledWith('ver');
});

it('searches for nothing rather than undefined when the box is empty', async () => {
  // The type-ahead fires before anything is typed.
  await controller.search(undefined as never);
  expect(clients.search).toHaveBeenCalledWith('');
});

it('records who added a client', async () => {
  await controller.create({ name: 'Verma Interiors' } as never, USER);
  expect(clients.create).toHaveBeenCalledWith({ name: 'Verma Interiors' }, 'u1');
});

it('updates a client', async () => {
  await controller.update('c1', { phone: '9820012345' } as never);
  expect(clients.update).toHaveBeenCalledWith('c1', { phone: '9820012345' });
});

it('adds a site to a client', async () => {
  await controller.addLocation('c1', { name: 'Andheri site' } as never);
  expect(clients.addLocation).toHaveBeenCalledWith('c1', { name: 'Andheri site' });
});

it('reads one client', async () => {
  await controller.findOne('c1');
  expect(clients.findOne).toHaveBeenCalledWith('c1');
});
