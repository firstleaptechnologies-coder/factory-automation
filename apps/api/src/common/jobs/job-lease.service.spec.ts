import { JobLeaseService } from './job-lease.service';
import { prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build() {
  const db = prismaMock() as never as Db;
  return { service: new JobLeaseService(db as never), db };
}

const NOW = new Date('2026-09-08T03:30:00.000Z');

describe('acquire', () => {
  it('takes over a lease whose holder has gone', async () => {
    const { service, db } = build();
    db.jobLease.updateMany = jest.fn(async () => ({ count: 1 }));

    expect(await service.acquire('tenant.health', 60_000, NOW)).toBe(true);
    // Never creates a second row: the name is the key.
    expect(db.jobLease.create).not.toHaveBeenCalled();
    expect(db.jobLease.updateMany.mock.calls[0][0].where).toEqual({
      name: 'tenant.health',
      expiresAt: { lte: NOW },
    });
  });

  it('claims a job that has never run', async () => {
    const { service, db } = build();
    db.jobLease.updateMany = jest.fn(async () => ({ count: 0 }));

    expect(await service.acquire('tenant.health', 60_000, NOW)).toBe(true);
    const created = db.jobLease.create.mock.calls[0][0].data;
    expect(created.name).toBe('tenant.health');
    expect(created.expiresAt).toEqual(new Date(NOW.getTime() + 60_000));
  });

  it('stands down when another process holds it', async () => {
    const { service, db } = build();
    db.jobLease.updateMany = jest.fn(async () => ({ count: 0 }));
    // What a unique-constraint violation looks like from here.
    db.jobLease.create = jest.fn(async () => {
      throw new Error('Unique constraint failed on the fields: (`name`)');
    });

    expect(await service.acquire('tenant.health', 60_000, NOW)).toBe(false);
  });

  it('stamps who holds it, so a stuck job can be traced to a process', async () => {
    const { service, db } = build();
    db.jobLease.updateMany = jest.fn(async () => ({ count: 0 }));

    await service.acquire('jobs.prune', 60_000, NOW);
    expect(db.jobLease.create.mock.calls[0][0].data.holder).toBe(service.holder);
    expect(service.holder).toContain(String(process.pid));
  });
});

describe('release', () => {
  it('expires only its own lease', async () => {
    const { service, db } = build();
    await service.release('jobs.prune', NOW);
    expect(db.jobLease.updateMany.mock.calls[0][0].where).toEqual({
      name: 'jobs.prune',
      // Without the holder, a process that had already lost the lease to an
      // expiry would hand the one that took over back to nobody.
      holder: service.holder,
    });
    expect(db.jobLease.updateMany.mock.calls[0][0].data).toEqual({ expiresAt: NOW });
  });
});
