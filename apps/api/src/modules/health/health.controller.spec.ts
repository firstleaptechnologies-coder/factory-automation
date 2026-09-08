import { HealthController } from './health.controller';

function build(queryRaw: jest.Mock = jest.fn(async () => [{ ok: 1 }])) {
  const prisma = { platform: { $queryRaw: queryRaw } };
  return { controller: new HealthController(prisma as never), queryRaw };
}

describe('health', () => {
  it('says which deployment this is', async () => {
    process.env.APP_ENV = 'staging';
    const { controller } = build();

    // The question that gets answered wrongly exactly once before it matters.
    expect((await controller.check()).env).toBe('staging');
    delete process.env.APP_ENV;
  });

  it('assumes development when nobody said', async () => {
    delete process.env.APP_ENV;
    const { controller } = build();
    expect((await controller.check()).env).toBe('development');
  });

  it('answers even when the database does not', async () => {
    const { controller } = build(
      jest.fn(async () => {
        throw new Error('connection refused');
      }),
    );

    const body = await controller.check();

    // "The API is up and the database is not" is the most useful thing this
    // endpoint can say, and it cannot say it by failing.
    expect(body.status).toBe('degraded');
    expect(body.database).toBe('unreachable');
  });

  it('is ok when it can reach the database', async () => {
    const { controller } = build();
    const body = await controller.check();
    expect(body).toMatchObject({ status: 'ok', database: 'ok' });
    expect(body.uptimeSeconds).toEqual(expect.any(Number));
  });
});
