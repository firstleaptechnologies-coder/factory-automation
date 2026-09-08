import { LogsService } from './logs.service';
import { inTenant, prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build() {
  const db = prismaMock() as never as Db;
  db.clientLog.createMany = jest.fn(async () => ({ count: 2 }));
  return { service: new LogsService(db as never), db };
}

const batch = {
  client: 'app' as const,
  platform: 'ios',
  appVersion: '1.4.0',
  entries: [
    { level: 'error' as const, message: 'Could not punch', at: '2026-09-08T09:00:00.000Z' },
    { level: 'info' as const, message: 'Signed in', at: '2026-09-08T09:01:00.000Z' },
  ],
};

describe('recording what a client saw', () => {
  it('keeps which workspace and which person it came from', async () => {
    const { service, db } = build();
    await inTenant(() => service.record(batch, 'u1'));

    const rows = db.clientLog.createMany.mock.calls[0][0].data;
    expect(rows[0]).toMatchObject({ tenantId: 'tenant-test', userId: 'u1', client: 'app' });
  });

  it('keeps when it happened on the device, not only when it arrived', async () => {
    const { service, db } = build();
    await inTenant(() => service.record(batch, 'u1'));

    // A device's clock can be wrong; both times are kept so it is obvious.
    const rows = db.clientLog.createMany.mock.calls[0][0].data;
    expect(rows[0].at).toEqual(new Date('2026-09-08T09:00:00.000Z'));
  });

  it('carries the version, which is the first question about any crash', async () => {
    const { service, db } = build();
    await inTenant(() => service.record(batch, 'u1'));
    expect(db.clientLog.createMany.mock.calls[0][0].data[0].appVersion).toBe('1.4.0');
  });

  it('says how many it took', async () => {
    const { service } = build();
    expect(await inTenant(() => service.record(batch, 'u1'))).toEqual({ recorded: 2 });
  });

  it('records what a signed-in browser saw without a device to name', async () => {
    const { service, db } = build();
    await inTenant(() =>
      service.record({ client: 'web', entries: batch.entries } as never, undefined),
    );
    expect(db.clientLog.createMany.mock.calls[0][0].data[0]).toMatchObject({
      client: 'web',
      platform: null,
      userId: null,
    });
  });
});
