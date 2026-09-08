import { WorkflowsController } from './workflows.controller';

const workflows = {
  list: jest.fn(async (..._a: unknown[]) => 'list'),
  getDefault: jest.fn(async (..._a: unknown[]) => 'default'),
  findOne: jest.fn(async (..._a: unknown[]) => 'one'),
  allowedNext: jest.fn(async (..._a: unknown[]) => 'moves'),
  create: jest.fn(async (..._a: unknown[]) => 'created'),
  setDefault: jest.fn(async (..._a: unknown[]) => 'set'),
  addStatus: jest.fn(async (..._a: unknown[]) => 'added'),
  updateStatus: jest.fn(async (..._a: unknown[]) => 'updated'),
  removeStatus: jest.fn(async (..._a: unknown[]) => 'removed'),
  saveGraph: jest.fn(async (..._a: unknown[]) => 'saved'),
  setHomeCard: jest.fn(async (..._a: unknown[]) => 'home card'),
  update: jest.fn(async (..._a: unknown[]) => 'updated'),
};

const controller = new WorkflowsController(workflows as never);

beforeEach(() => jest.clearAllMocks());

it('lists the flows and names the default one', async () => {
  await controller.list();
  await controller.getDefault();
  expect(workflows.list).toHaveBeenCalled();
  expect(workflows.getDefault).toHaveBeenCalled();
});

it('answers what an order at a given stage may do next', async () => {
  // The apps ask before offering a move, so a refused drop is rare.
  await controller.allowedNext('s2');
  expect(workflows.allowedNext).toHaveBeenCalledWith('s2');
});

it('adds a stage to the flow it belongs to', async () => {
  await controller.addStatus('w1', { code: 'POLISH', name: 'Polishing' } as never);
  expect(workflows.addStatus).toHaveBeenCalledWith('w1', { code: 'POLISH', name: 'Polishing' });
});

it('edits and removes a stage by the stage’s own id', async () => {
  await controller.updateStatus('s2', { name: 'On the machine' } as never);
  await controller.removeStatus('s2');
  expect(workflows.updateStatus).toHaveBeenCalledWith('s2', { name: 'On the machine' });
  expect(workflows.removeStatus).toHaveBeenCalledWith('s2');
});

it('saves the whole graph at once, which is how the canvas edits it', async () => {
  const graph = { positions: [], transitions: [] };
  await controller.saveGraph('w1', graph as never);
  expect(workflows.saveGraph).toHaveBeenCalledWith('w1', graph);
});

it('creates a flow and makes one the default', async () => {
  await controller.create({ name: 'Job work' } as never);
  await controller.setDefault('w2');
  expect(workflows.create).toHaveBeenCalledWith({ name: 'Job work' });
  expect(workflows.setDefault).toHaveBeenCalledWith('w2');
});

it('reads one flow', async () => {
  await controller.findOne('w1');
  expect(workflows.findOne).toHaveBeenCalledWith('w1');
});

it('sets which stages the home screen counts, in the order they were sent', async () => {
  await controller.setHomeCard('w1', { statusIds: ['s3', 's1'] } as never);
  // The order is the point: a stage's place in the list is its place on the card.
  expect(workflows.setHomeCard).toHaveBeenCalledWith('w1', ['s3', 's1']);
});

it('reads the enquiry pipeline when it is asked for by kind', async () => {
  await controller.getDefault('LEAD');
  expect(workflows.getDefault).toHaveBeenCalledWith('LEAD');
});

it('reads the order flow by default', async () => {
  await controller.getDefault();
  expect(workflows.getDefault).toHaveBeenCalledWith('ORDER');
});

it('treats an unrecognised kind as the order flow', async () => {
  await controller.getDefault('nonsense');
  expect(workflows.getDefault).toHaveBeenCalledWith('ORDER');
});

it('changes the flow itself', async () => {
  await controller.update('w1', { leadExpiryDays: 45 } as never);
  expect(workflows.update).toHaveBeenCalledWith('w1', { leadExpiryDays: 45 });
});
