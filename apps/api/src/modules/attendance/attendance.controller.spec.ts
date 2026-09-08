import { AttendanceController } from './attendance.controller';

const attendance = {
  day: jest.fn(async (..._a: unknown[]) => 'day'),
  register: jest.fn(async (..._a: unknown[]) => 'register'),
  summary: jest.fn(async (..._a: unknown[]) => 'summary'),
  markDay: jest.fn(async (..._a: unknown[]) => 'marked'),
};

const controller = new AttendanceController(attendance as never);

beforeEach(() => jest.clearAllMocks());

it('asks for one day by its date', async () => {
  await controller.day({ date: '2026-09-09' } as never);
  expect(attendance.day).toHaveBeenCalledWith({ date: '2026-09-09' });
});

it('passes the window through to the register and the summary', async () => {
  const window = { from: '2026-09-01', to: '2026-09-30' };
  await controller.register(window as never);
  await controller.summary(window as never);
  expect(attendance.register).toHaveBeenCalledWith(window);
  expect(attendance.summary).toHaveBeenCalledWith(window);
});

it('records who marked the register, from the session', async () => {
  const body = { date: '2026-09-09', marks: [] };
  await controller.markDay(body as never, { id: 'u9' } as never);
  expect(attendance.markDay).toHaveBeenCalledWith(body, 'u9');
});

it('marks a day at a time, never a row at a time', () => {
  // A shop marks the register by standing at the door and going down the list.
  expect('markOne' in controller).toBe(false);
});
