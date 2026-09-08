import { ExpensesController } from './expenses.controller';

const expenses = {
  optionsForForm: jest.fn(async () => 'form options'),
  listOptions: jest.fn(async (..._a: unknown[]) => 'all options'),
  createOption: jest.fn(async (..._a: unknown[]) => 'created option'),
  updateOption: jest.fn(async (..._a: unknown[]) => 'updated option'),
  removeOption: jest.fn(async (..._a: unknown[]) => 'retired option'),
  reorderOptions: jest.fn(async (..._a: unknown[]) => 'reordered'),
  list: jest.fn(async (..._a: unknown[]) => 'page'),
  get: jest.fn(async (..._a: unknown[]) => 'one'),
  create: jest.fn(async (..._a: unknown[]) => 'created'),
  update: jest.fn(async (..._a: unknown[]) => 'updated'),
  reverse: jest.fn(async (..._a: unknown[]) => 'taken back'),
  editHistory: jest.fn(async (..._a: unknown[]) => 'edits'),
  analytics: jest.fn(async (..._a: unknown[]) => 'analytics'),
  attachBill: jest.fn(async (..._a: unknown[]) => 'attached'),
  removeBill: jest.fn(async (..._a: unknown[]) => 'unpinned'),
};

const controller = new ExpensesController(expenses as never);

beforeEach(() => jest.clearAllMocks());

it('hands the query straight through to the service', async () => {
  const query = { page: 2, limit: 20, skip: 20, spentType: 'Rent' };
  await controller.list(query as never);
  expect(expenses.list).toHaveBeenCalledWith(query);
});

it('records who spent it from the session, never from the body', async () => {
  // Identity taken from the request; a body claiming somebody else's id is
  // how an audit trail starts lying.
  await controller.create({ amount: 500 } as never, { id: 'u9' } as never);
  expect(expenses.create).toHaveBeenCalledWith({ amount: 500 }, 'u9');
});

it('still records an expense when nobody is attached to the request', async () => {
  await controller.create({ amount: 500 } as never, undefined);
  expect(expenses.create).toHaveBeenCalledWith({ amount: 500 }, undefined);
});

it('keeps the form list and the config list apart', async () => {
  await controller.optionsForForm();
  await controller.listOptions('VENDOR' as never);
  // The form wants active labels; the config screen wants every row.
  expect(expenses.optionsForForm).toHaveBeenCalled();
  expect(expenses.listOptions).toHaveBeenCalledWith('VENDOR');
});

it('edits, retires and reorders options by id', async () => {
  await controller.updateOption('o1', { label: 'Diesel' } as never);
  await controller.removeOption('o1');
  await controller.reorderOptions({ field: 'VENDOR', orderedIds: ['o1'] } as never);
  expect(expenses.updateOption).toHaveBeenCalledWith('o1', { label: 'Diesel' });
  expect(expenses.removeOption).toHaveBeenCalledWith('o1');
  expect(expenses.reorderOptions).toHaveBeenCalledWith({
    field: 'VENDOR',
    orderedIds: ['o1'],
  });
});

it('reads and edits one expense by its own id', async () => {
  await controller.get('e1');
  await controller.update('e1', { amount: 900 } as never, { id: 'u9' } as never);
  expect(expenses.get).toHaveBeenCalledWith('e1');
  expect(expenses.update).toHaveBeenCalledWith('e1', { amount: 900 }, 'u9');
});

it('takes an expense back rather than deleting it', async () => {
  // There is no delete: money that moved is never quietly unmoved.
  expect('remove' in controller).toBe(false);
  await controller.reverse('e1', { reason: 'Never happened' } as never, { id: 'u9' } as never);
  expect(expenses.reverse).toHaveBeenCalledWith('e1', 'Never happened', 'u9');
});

it('reads the story one expense kept', async () => {
  await controller.editHistory('e1');
  expect(expenses.editHistory).toHaveBeenCalledWith('e1');
});

it('passes the dates through to the analytics', async () => {
  await controller.analytics({ from: '2026-04-01', to: '2027-03-31' } as never);
  expect(expenses.analytics).toHaveBeenCalledWith({
    from: '2026-04-01',
    to: '2027-03-31',
  });
});

it('takes the bill from the upload and the person from the session', async () => {
  await controller.attachBill('e1', { originalname: 'bill.jpg' } as never, { id: 'u9' } as never);
  expect(expenses.attachBill).toHaveBeenCalledWith('e1', { originalname: 'bill.jpg' }, 'u9');
});

it('unpins a bill by the expense it is on', async () => {
  await controller.removeBill('e1');
  expect(expenses.removeBill).toHaveBeenCalledWith('e1');
});
