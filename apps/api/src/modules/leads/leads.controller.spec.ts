import { LeadsController } from './leads.controller';

const leads = {
  list: jest.fn(async (..._a: unknown[]) => 'list'),
  board: jest.fn(async (..._a: unknown[]) => 'board'),
  listSources: jest.fn(async (..._a: unknown[]) => 'sources'),
  findOne: jest.fn(async (..._a: unknown[]) => 'one'),
  create: jest.fn(async (..._a: unknown[]) => 'created'),
  update: jest.fn(async (..._a: unknown[]) => 'updated'),
  changeStatus: jest.fn(async (..._a: unknown[]) => 'moved'),
  convert: jest.fn(async (..._a: unknown[]) => 'converted'),
  createSource: jest.fn(async (..._a: unknown[]) => 'source'),
};

const customFields = {
  list: jest.fn(async (..._a: unknown[]) => 'fields'),
  create: jest.fn(async (..._a: unknown[]) => 'field'),
  update: jest.fn(async (..._a: unknown[]) => 'updated'),
  deactivate: jest.fn(async (..._a: unknown[]) => 'gone'),
};

const controller = new LeadsController(leads as never, customFields as never);
const USER = { id: 'u1', code: 'SALES01', role: 'SALES', permissions: [] } as never;

beforeEach(() => jest.clearAllMocks());

it('passes the query through', async () => {
  await controller.list({ statusId: 's1' } as never);
  expect(leads.list).toHaveBeenCalledWith({ statusId: 's1' });
});

it('asks for a particular pipeline’s board when one is named', async () => {
  await controller.board('w1');
  expect(leads.board).toHaveBeenCalledWith('w1');
});

it('records who took an enquiry', async () => {
  await controller.create({ title: 'Kitchen jali' } as never, USER);
  expect(leads.create).toHaveBeenCalledWith({ title: 'Kitchen jali' }, 'u1');
});

it('carries who moved a lead, for the history', async () => {
  await controller.changeStatus('l1', { toStatusId: 's2' } as never, USER);
  expect(leads.changeStatus).toHaveBeenCalledWith('l1', { toStatusId: 's2' }, USER);
});

it('carries who converted one, since it writes an order', async () => {
  await controller.convert('l1', { location: 'Andheri' } as never, USER);
  expect(leads.convert).toHaveBeenCalledWith('l1', { location: 'Andheri' }, USER);
});

describe('what the shop captures on an enquiry', () => {
  it('hides the retired sources and fields from the lead form', async () => {
    await controller.listSources();
    await controller.listFields();
    // The form must not offer a source nobody uses any more.
    expect(leads.listSources).toHaveBeenCalledWith(false);
    expect(customFields.list).toHaveBeenCalledWith('LEAD', false);
  });

  it('includes them when the admin screen asks', async () => {
    await controller.listSources('true');
    await controller.listFields('true');
    expect(leads.listSources).toHaveBeenCalledWith(true);
    expect(customFields.list).toHaveBeenCalledWith('LEAD', true);
  });

  it('adds a source and a field', async () => {
    await controller.createSource({ code: 'WALKIN', name: 'Walk in' } as never);
    await controller.createField({ label: 'Architect' } as never);
    expect(leads.createSource).toHaveBeenCalledWith({ code: 'WALKIN', name: 'Walk in' });
    expect(customFields.create).toHaveBeenCalledWith({ label: 'Architect' });
  });

  it('deactivates a field rather than deleting what was captured under it', async () => {
    await controller.deactivateField('f1');
    expect(customFields.deactivate).toHaveBeenCalledWith('f1');
  });

  it('edits a field', async () => {
    await controller.updateField('f1', { label: 'Site engineer' } as never);
    expect(customFields.update).toHaveBeenCalledWith('f1', { label: 'Site engineer' });
  });
});

it('reads and edits one lead', async () => {
  await controller.findOne('l1');
  await controller.update('l1', { title: 'Kitchen jali' } as never);
  expect(leads.findOne).toHaveBeenCalledWith('l1');
  expect(leads.update).toHaveBeenCalledWith('l1', { title: 'Kitchen jali' });
});
