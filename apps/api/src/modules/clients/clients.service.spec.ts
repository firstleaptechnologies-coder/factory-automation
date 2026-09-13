import { NotFoundException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { inTenant, prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build() {
  const db = prismaMock() as never as Db;
  const codes = { next: jest.fn(async () => 'CLI-1') };
  return { service: new ClientsService(db as never, codes as never), db, codes };
}

function txReturns(db: Db, value: unknown) {
  (db as unknown as Record<string, jest.Mock>).$transaction = jest.fn(async () => value);
}

describe('list', () => {
  const query = (over: Record<string, unknown> = {}) =>
    ({ skip: 0, limit: 20, page: 1, ...over }) as never;

  it('shows only active clients when nothing is searched', async () => {
    const { service, db } = build();
    txReturns(db, [[], 0]);
    await service.list(query());
    expect(db.client.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
  });

  it('searches name, company, phone, code and email — still only active', async () => {
    const { service, db } = build();
    txReturns(db, [[], 0]);
    await service.list(query({ search: 'verma' }));
    const where = db.client.findMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.OR).toHaveLength(5);
  });

  it('ignores a search that is only whitespace', async () => {
    const { service, db } = build();
    txReturns(db, [[], 0]);
    await service.list(query({ search: '   ' }));
    expect(db.client.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
  });

  it('counts against the same filter it lists with', async () => {
    const { service, db } = build();
    txReturns(db, [[], 0]);
    await service.list(query({ search: 'verma' }));
    expect(db.client.count.mock.calls[0][0].where).toEqual(
      db.client.findMany.mock.calls[0][0].where,
    );
  });
});

describe('search', () => {
  it('returns nothing for an empty term rather than the whole book', async () => {
    const { service, db } = build();
    await expect(service.search('')).resolves.toEqual([]);
    expect(db.client.findMany).not.toHaveBeenCalled();
  });

  it('returns nothing for whitespace', async () => {
    const { service, db } = build();
    await expect(service.search('  ')).resolves.toEqual([]);
    expect(db.client.findMany).not.toHaveBeenCalled();
  });

  it('stays small — the operator is mid-punch, not browsing', async () => {
    const { service, db } = build();
    await service.search('verma');
    expect(db.client.findMany.mock.calls[0][0].take).toBe(8);
  });

  it('puts the clients ordered from most often first', async () => {
    const { service, db } = build();
    await service.search('verma');
    expect(db.client.findMany.mock.calls[0][0].orderBy[0]).toEqual({
      orders: { _count: 'desc' },
    });
  });

  it('brings the sites back too, most used first', async () => {
    const { service, db } = build();
    await service.search('verma');
    const locations = db.client.findMany.mock.calls[0][0].select.locations;
    expect(locations).toMatchObject({ orderBy: { useCount: 'desc' }, take: 5 });
  });

  it('honours a caller-supplied limit', async () => {
    const { service, db } = build();
    await service.search('verma', 3);
    expect(db.client.findMany.mock.calls[0][0].take).toBe(3);
  });
});

describe('findOne', () => {
  it('reports a missing client', async () => {
    const { service } = build();
    await expect(service.findOne('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('brings back the recent orders, newest first', async () => {
    const { service, db } = build();
    db.client.findUnique = jest.fn(async () => ({ id: 'c1' }));
    await service.findOne('c1');
    expect(db.client.findUnique.mock.calls[0][0].include.orders).toMatchObject({
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
  });
});

describe('create', () => {
  it('allocates a code and stamps the tenant and creator', async () => {
    const { service, db } = build();
    await inTenant(() => service.create({ name: 'Verma Interiors' } as never, 'u1'));
    expect(db.client.create.mock.calls[0][0].data).toMatchObject({
      name: 'Verma Interiors',
      code: 'CLI-1',
      tenantId: 'tenant-test',
      createdById: 'u1',
    });
  });
});

describe('update', () => {
  it('refuses an unknown client before writing', async () => {
    const { service, db } = build();
    await expect(service.update('ghost', {} as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.client.update).not.toHaveBeenCalled();
  });
});

describe('addLocation', () => {
  it('bumps the address on a site the client already has', async () => {
    const { service, db } = build();
    db.client.findUnique = jest.fn(async () => ({ id: 'c1' }));
    await inTenant(() => service.addLocation('c1', { name: 'Site A', address: 'Andheri' } as never));
    // Upsert on (client, name): the same site typed twice is one row, so the
    // punch screen's site list does not fill with duplicates.
    expect(db.clientLocation.upsert.mock.calls[0][0]).toMatchObject({
      where: { clientId_name: { clientId: 'c1', name: 'Site A' } },
      update: { address: 'Andheri' },
    });
  });

  it('refuses an unknown client', async () => {
    const { service } = build();
    await expect(
      service.addLocation('ghost', { name: 'Site A' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

/*
 * Adding a client without leaving the screen you are on.
 *
 * Punching an order and writing a quote both offer it, and both land here, so
 * the two cannot disagree about when a typed-in client is somebody the shop
 * already has.
 */
describe('resolveInline', () => {
  const inline = { name: 'Verma Interiors', phone: '98200 12345' };

  it('reuses an existing client matching on the last ten digits of the phone', async () => {
    const { service, db } = build();
    db.client.findFirst = jest.fn(async () => ({ id: 'existing' }));

    const id = await inTenant(() => service.resolveInline(db as never, inline as never));

    expect(id).toBe('existing');
    expect(db.client.create).not.toHaveBeenCalled();
    expect(db.client.findFirst.mock.calls[0][0].where).toMatchObject({
      isActive: true,
      phone: { contains: '9820012345' },
    });
  });

  it('creates the client, with a code and the caller against it, when nothing matches', async () => {
    const { service, db } = build();
    db.client.create = jest.fn(async () => ({ id: 'new-client' }));

    const id = await inTenant(() => service.resolveInline(db as never, inline as never, 'u1'));

    expect(id).toBe('new-client');
    expect(db.client.create.mock.calls[0][0].data).toMatchObject({
      name: 'Verma Interiors',
      code: 'CLI-1',
      createdById: 'u1',
      tenantId: 'tenant-test',
    });
  });

  it('does not match on a phone too short to identify anyone', async () => {
    const { service, db } = build();
    db.client.create = jest.fn(async () => ({ id: 'new-client' }));

    await inTenant(() => service.resolveInline(db as never, { name: 'X', phone: '123' } as never));

    expect(db.client.findFirst).not.toHaveBeenCalled();
    expect(db.client.create).toHaveBeenCalled();
  });

  it('leaves a name collision alone — two clients can share a name', async () => {
    const { service, db } = build();
    db.client.create = jest.fn(async () => ({ id: 'new-client' }));

    await inTenant(() => service.resolveInline(db as never, { name: 'Verma Interiors' } as never));

    expect(db.client.findFirst).not.toHaveBeenCalled();
    expect(db.client.create).toHaveBeenCalled();
  });
});
