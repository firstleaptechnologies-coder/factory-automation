import { EmployeesController } from './employees.controller';

const employees = {
  list: jest.fn(async (..._a: unknown[]) => 'page'),
  get: jest.fn(async (..._a: unknown[]) => 'one'),
  identifiers: jest.fn(async (..._a: unknown[]) => 'secrets'),
  create: jest.fn(async (..._a: unknown[]) => 'created'),
  update: jest.fn(async (..._a: unknown[]) => 'updated'),
  markLeft: jest.fn(async (..._a: unknown[]) => 'left'),
};

const controller = new EmployeesController(employees as never);

beforeEach(() => jest.clearAllMocks());

it('hands the query straight through', async () => {
  const query = { page: 1, limit: 20, skip: 0, department: 'Production' };
  await controller.list(query as never);
  expect(employees.list).toHaveBeenCalledWith(query);
});

it('records who added somebody from the session, never from the body', async () => {
  await controller.create({ name: 'Ramesh' } as never, { id: 'u9' } as never);
  expect(employees.create).toHaveBeenCalledWith({ name: 'Ramesh' }, 'u9');
});

it('keeps the identifiers behind a route of their own', async () => {
  // Reading somebody's Aadhaar is a deliberate act, not a side effect of
  // opening a screen.
  await controller.get('e1');
  expect(employees.identifiers).not.toHaveBeenCalled();
  await controller.identifiers('e1');
  expect(employees.identifiers).toHaveBeenCalledWith('e1');
});

it('marks somebody left with the day they left', async () => {
  await controller.markLeft('e1', { leftOn: '2026-09-30' } as never);
  expect(employees.markLeft).toHaveBeenCalledWith('e1', '2026-09-30');
});

it('has no delete at all', () => {
  // Last year's attendance and last month's payslip hang off the row.
  expect('remove' in controller).toBe(false);
});
