import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { StatusCategory, UserRole, WorkflowKind } from '@prisma/client';
import { LeadsService } from './leads.service';
import { CustomFieldsService } from './custom-fields.service';
import { PERMISSIONS } from '@fas/shared';
import { inTenant, prismaMock, notificationsMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build() {
  const db = prismaMock() as never as Db;
  const codes = { next: jest.fn(async () => 'LEAD-1') };
  const customFields = new CustomFieldsService(db as never);
  const orders = {
    punch: jest.fn(
      async (..._args: unknown[]) =>
        ({ id: 'o1', code: 'ORD-1' }) as { id: string; code: string; clientId?: string },
    ),
  };

  db.workflow.findFirst = jest.fn(async () => ({
    id: 'w1',
    code: 'PIPE',
    name: 'Pipeline',
    statuses: [
      { id: 'l1', name: 'New', isInitial: true, sortOrder: 0 },
      { id: 'l2', name: 'Quoted', isInitial: false, sortOrder: 1 },
    ],
  }));

  return {
    service: new LeadsService(db as never, codes as never, customFields, orders as never, notificationsMock() as never),
    db,
    orders,
    codes,
  };
}

/** `list` reads through a $transaction([...]) array rather than a callback. */
function txReturns(db: Db, value: unknown) {
  (db as unknown as Record<string, jest.Mock>).$transaction = jest.fn(async () => value);
}

describe('sources', () => {
  it('hides inactive sources by default', async () => {
    const { service, db } = build();
    await service.listSources();
    expect(db.leadSource.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
  });

  it('can include them for the admin screen', async () => {
    const { service, db } = build();
    await service.listSources(true);
    expect(db.leadSource.findMany.mock.calls[0][0].where).toEqual({});
  });

  it('stamps the tenant on a new source', () => {
    const { service, db } = build();
    inTenant(() => service.createSource({ code: 'REF', name: 'Referral' } as never));
    expect(db.leadSource.create.mock.calls[0][0].data.tenantId).toBe('tenant-test');
  });
});

describe('list', () => {
  const query = (over: Record<string, unknown> = {}) =>
    ({ skip: 0, limit: 20, page: 1, ...over }) as never;

  it('searches code, title, contact, phone and company', async () => {
    const { service, db } = build();
    txReturns(db, [[], 0]);
    await service.list(query({ search: 'verma' }));
    expect(db.lead.findMany.mock.calls[0][0].where.OR).toHaveLength(5);
  });

  it('does not lower-case the phone search — digits have no case', async () => {
    const { service, db } = build();
    txReturns(db, [[], 0]);
    await service.list(query({ search: '98200' }));
    const phoneClause = db.lead.findMany.mock.calls[0][0].where.OR[3];
    expect(phoneClause.contactPhone).toEqual({ contains: '98200' });
  });

  it('finds only converted leads when asked', async () => {
    const { service, db } = build();
    txReturns(db, [[], 0]);
    await service.list(query({ converted: true }));
    expect(db.lead.findMany.mock.calls[0][0].where.convertedOrderId).toEqual({ not: null });
  });

  it('finds only open leads when asked', async () => {
    const { service, db } = build();
    txReturns(db, [[], 0]);
    await service.list(query({ converted: false }));
    expect(db.lead.findMany.mock.calls[0][0].where.convertedOrderId).toBeNull();
  });

  it('does not filter on conversion when the caller says nothing', async () => {
    const { service, db } = build();
    txReturns(db, [[], 0]);
    await service.list(query());
    expect(db.lead.findMany.mock.calls[0][0].where).not.toHaveProperty('convertedOrderId');
  });

  it('counts against the same filter it lists with', async () => {
    const { service, db } = build();
    txReturns(db, [[], 0]);
    await service.list(query({ ownerId: 'u1', sourceId: 's1' }));
    expect(db.lead.count.mock.calls[0][0].where).toEqual(db.lead.findMany.mock.calls[0][0].where);
  });
});

describe('create', () => {
  it('refuses a lead with no client and no way to reach anyone', async () => {
    const { service } = build();
    await expect(inTenant(() => service.create({ title: 'Kitchen' } as never))).rejects.toThrow(
      /existing client or a contact name or phone/,
    );
  });

  it('accepts a lead identified only by a phone number', async () => {
    const { service, db } = build();
    await inTenant(() =>
      service.create({ title: 'Kitchen', contactPhone: '9820012345' } as never),
    );
    expect(db.lead.create).toHaveBeenCalled();
  });

  it('refuses a pipeline with no starting stage', async () => {
    const { service, db } = build();
    db.workflow.findFirst = jest.fn(async () => ({
      id: 'w1',
      name: 'Pipeline',
      statuses: [{ id: 'l2', isInitial: false }],
    }));
    await expect(
      inTenant(() => service.create({ title: 'X', contactName: 'A' } as never)),
    ).rejects.toThrow(/no starting status/);
  });

  it('reports when no lead pipeline exists at all', async () => {
    const { service, db } = build();
    db.workflow.findFirst = jest.fn(async () => null);
    await expect(
      inTenant(() => service.create({ title: 'X', contactName: 'A' } as never)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolves the default LEAD pipeline, not the order one', async () => {
    const { service, db } = build();
    await inTenant(() => service.create({ title: 'X', contactName: 'A' } as never));
    expect(db.workflow.findFirst.mock.calls[0][0].where).toMatchObject({
      kind: WorkflowKind.LEAD,
      isDefault: true,
      isActive: true,
    });
  });

  it('starts on the initial stage and writes the opening history row', async () => {
    const { service, db } = build();
    await inTenant(() => service.create({ title: 'X', contactName: 'A' } as never));
    const data = db.lead.create.mock.calls[0][0].data;
    expect(data.statusId).toBe('l1');
    expect(data.statusHistory.create).toMatchObject({
      toStatusId: 'l1',
      note: 'Lead created',
      tenantId: 'tenant-test',
    });
  });

  it('makes the creator the owner when none is named', async () => {
    const { service, db } = build();
    await inTenant(() => service.create({ title: 'X', contactName: 'A' } as never, 'u1'));
    expect(db.lead.create.mock.calls[0][0].data.ownerId).toBe('u1');
  });

  it('keeps an explicit owner', async () => {
    const { service, db } = build();
    await inTenant(() =>
      service.create({ title: 'X', contactName: 'A', ownerId: 'u2' } as never, 'u1'),
    );
    expect(db.lead.create.mock.calls[0][0].data.ownerId).toBe('u2');
  });

  it('validates custom fields on the way in', async () => {
    const { service, db } = build();
    db.customFieldDefinition.findMany = jest.fn(async () => [
      { key: 'budget', label: 'Budget', type: 'NUMBER', options: [], required: true },
    ]);
    await expect(
      inTenant(() => service.create({ title: 'X', contactName: 'A' } as never)),
    ).rejects.toThrow(/Budget is required/);
  });
});

describe('update', () => {
  function withLead(db: Db, over: Record<string, unknown> = {}) {
    db.lead.findUnique = jest.fn(async () => ({
      id: 'ld1',
      code: 'LEAD-1',
      statusId: 'l1',
      workflowId: 'w1',
      customFields: { architect: 'Rao', budget: 500 },
      ...over,
    }));
  }

  it('merges custom fields rather than replacing them', async () => {
    const { service, db } = build();
    withLead(db);
    db.customFieldDefinition.findMany = jest.fn(async () => [
      { key: 'architect', label: 'Architect', type: 'TEXT', options: [], required: false },
      { key: 'budget', label: 'Budget', type: 'NUMBER', options: [], required: false },
    ]);
    await service.update('ld1', { customFields: { budget: 900 } } as never);
    // A form showing a subset of fields must not wipe the ones it did not render.
    expect(db.lead.update.mock.calls[0][0].data.customFields).toEqual({
      architect: 'Rao',
      budget: 900,
    });
  });

  it('does not demand required fields on an edit', async () => {
    const { service, db } = build();
    withLead(db, { customFields: {} });
    db.customFieldDefinition.findMany = jest.fn(async () => [
      { key: 'budget', label: 'Budget', type: 'NUMBER', options: [], required: true },
    ]);
    await expect(service.update('ld1', { title: 'New title' } as never)).resolves.toBeDefined();
  });

  it('reports a missing lead', async () => {
    const { service, db } = build();
    db.lead.findUnique = jest.fn(async () => null);
    await expect(service.update('ghost', {} as never)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('changeStatus', () => {
  const lead = {
    id: 'ld1',
    workflowId: 'w1',
    statusId: 'l1',
    status: { id: 'l1', name: 'New' },
    customFields: {},
  };

  function withLead(db: Db, over: Record<string, unknown> = {}) {
    db.lead.findUnique = jest.fn(async () => ({ ...lead, ...over }));
  }

  it('is a no-op when the lead is already there', async () => {
    const { service, db } = build();
    withLead(db);
    await service.changeStatus('ld1', { toStatusId: 'l1' } as never);
    expect(db.lead.update).not.toHaveBeenCalled();
  });

  it('refuses a move the pipeline has no edge for, naming both stages', async () => {
    const { service, db } = build();
    withLead(db);
    db.workflowStatus.findUnique = jest.fn(async () => ({ name: 'Won' }));
    await expect(service.changeStatus('ld1', { toStatusId: 'l9' } as never)).rejects.toThrow(
      /from New to Won/,
    );
  });

  it('falls back to "that stage" when the target does not exist either', async () => {
    const { service, db } = build();
    withLead(db);
    await expect(service.changeStatus('ld1', { toStatusId: 'l9' } as never)).rejects.toThrow(
      /that stage/,
    );
  });

  it('refuses a role that is not on the edge', async () => {
    const { service, db } = build();
    withLead(db);
    db.workflowTransition.findUnique = jest.fn(async () => ({
      allowedRoles: [UserRole.ADMIN],
      requiresNote: false,
      toStatus: { name: 'Quoted' },
    }));
    await expect(
      service.changeStatus('ld1', { toStatusId: 'l2' } as never, {
        id: 'u1',
        role: UserRole.SALES,
      }),
    ).rejects.toThrow(/role cannot make this move/);
  });

  it('demands a note when the edge requires one', async () => {
    const { service, db } = build();
    withLead(db);
    db.workflowTransition.findUnique = jest.fn(async () => ({
      allowedRoles: [],
      requiresNote: true,
      toStatus: { name: 'Lost' },
    }));
    await expect(service.changeStatus('ld1', { toStatusId: 'l2' } as never)).rejects.toThrow(
      /requires a note/,
    );
  });

  it('records where it came from, where it went, and who moved it', async () => {
    const { service, db } = build();
    withLead(db);
    db.workflowTransition.findUnique = jest.fn(async () => ({
      allowedRoles: [],
      requiresNote: false,
      toStatus: { name: 'Quoted' },
    }));
    await inTenant(() =>
      service.changeStatus('ld1', { toStatusId: 'l2', note: 'Sent' } as never, { id: 'u1' }),
    );
    expect(db.leadStatusHistory.create.mock.calls[0][0].data).toMatchObject({
      leadId: 'ld1',
      fromStatusId: 'l1',
      toStatusId: 'l2',
      note: 'Sent',
      changedById: 'u1',
      tenantId: 'tenant-test',
    });
  });

  describe('going back', () => {
    /** No edge forwards, one edge the other way round. */
    function onlyBackwards(db: Db) {
      db.workflowTransition.findUnique = jest.fn(async (args: any) =>
        args.where.workflowId_fromStatusId_toStatusId.fromStatusId === 'l0'
          ? { id: 't0', allowedRoles: [], requiresNote: false }
          : null,
      );
      db.workflowStatus.findUnique = jest.fn(async () => ({ id: 'l0', name: 'Contacted' }));
    }

    const mover = {
      id: 'u1',
      role: UserRole.ADMIN,
      permissions: [PERMISSIONS.LEAD_MOVE_BACK],
    };

    it('refuses somebody who is not allowed to send an enquiry back', async () => {
      const { service, db } = build();
      withLead(db, { statusId: 'l1', status: { id: 'l1', name: 'Quoted' } });
      onlyBackwards(db);
      await expect(
        service.changeStatus('ld1', { toStatusId: 'l0', reverse: true } as never, {
          id: 'u2',
          role: UserRole.SALES,
          permissions: [PERMISSIONS.LEAD_MOVE_STATUS],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.lead.update).not.toHaveBeenCalled();
    });

    it('refuses a move back that was never acknowledged', async () => {
      const { service, db } = build();
      withLead(db, { statusId: 'l1', status: { id: 'l1', name: 'Quoted' } });
      onlyBackwards(db);
      await expect(
        service.changeStatus('ld1', { toStatusId: 'l0' } as never, mover),
      ).rejects.toThrow(/move back, not part of the usual journey/);
      expect(db.lead.update).not.toHaveBeenCalled();
    });

    it('makes the move once it is acknowledged by somebody allowed to', async () => {
      const { service, db } = build();
      withLead(db, { statusId: 'l1', status: { id: 'l1', name: 'Quoted' } });
      onlyBackwards(db);
      await inTenant(() =>
        service.changeStatus(
          'ld1',
          { toStatusId: 'l0', reverse: true, note: 'Talking again' } as never,
          mover,
        ),
      );
      expect(db.lead.update).toHaveBeenCalled();
      expect(db.leadStatusHistory.create.mock.calls[0][0].data).toMatchObject({
        fromStatusId: 'l1',
        toStatusId: 'l0',
        note: 'Talking again',
        reversed: true,
      });
    });

    it('will not invent a stage the enquiry never sat at', async () => {
      const { service, db } = build();
      withLead(db, { statusId: 'l1', status: { id: 'l1', name: 'Quoted' } });
      db.workflowTransition.findUnique = jest.fn(async () => null);
      db.workflowStatus.findUnique = jest.fn(async () => ({ name: 'Won' }));
      await expect(
        service.changeStatus('ld1', { toStatusId: 'l9', reverse: true } as never, mover),
      ).rejects.toThrow(/does not allow moving from Quoted to Won/);
    });
  });

  it('reports a missing lead', async () => {
    const { service, db } = build();
    db.lead.findUnique = jest.fn(async () => null);
    await expect(
      service.changeStatus('ghost', { toStatusId: 'l2' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('convert', () => {
  function withLead(db: Db, over: Record<string, unknown> = {}) {
    db.lead.findUnique = jest.fn(async () => ({
      id: 'ld1',
      code: 'LEAD-1',
      statusId: 'l1',
      workflowId: 'w1',
      priority: 'HIGH',
      clientId: null,
      contactName: 'Verma',
      contactPhone: '9820012345',
      contactEmail: null,
      company: 'Verma Interiors',
      title: 'Kitchen',
      customFields: {},
      convertedOrderId: null,
      ...over,
    }));
  }

  const quote = (over: Record<string, unknown> = {}) => ({
    id: 'e1',
    code: 'EST-1',
    orderId: null,
    clientId: null,
    ...over,
  });

  const dto = (over: Record<string, unknown> = {}) =>
    ({ location: 'Site A', items: [{ materialId: 'm1' }], ...over }) as never;

  const punched = (orders: { punch: jest.Mock }) =>
    orders.punch.mock.calls[0][0] as never as Record<string, never>;

  it('refuses to convert a lead twice, naming the order it became', async () => {
    const { service, db } = build();
    withLead(db, { convertedOrderId: 'o1', convertedOrder: { code: 'ORD-1' } });
    await expect(service.convert('ld1', dto())).rejects.toThrow(
      /LEAD-1 was already converted into ORD-1/,
    );
  });

  it('refuses a conversion with no items', async () => {
    const { service, db } = build();
    withLead(db);
    await expect(service.convert('ld1', dto({ items: [] }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('turns loose contact details into a new client', async () => {
    const { service, db, orders } = build();
    withLead(db);
    await inTenant(() => service.convert('ld1', dto()));
    expect(punched(orders)).toMatchObject({
      clientId: undefined,
      newClient: {
        name: 'Verma',
        phone: '9820012345',
        company: 'Verma Interiors',
      },
    });
  });

  it('falls back to the company, then the title, for a nameless contact', async () => {
    const { service, db, orders } = build();
    withLead(db, { contactName: null });
    await inTenant(() => service.convert('ld1', dto()));
    expect((punched(orders).newClient as { name: string }).name).toBe('Verma Interiors');
  });

  it('reuses the linked client instead of making another', async () => {
    const { service, db, orders } = build();
    withLead(db, { clientId: 'c1' });
    await inTenant(() => service.convert('ld1', dto()));
    expect(punched(orders)).toMatchObject({
      clientId: 'c1',
      newClient: undefined,
    });
  });

  it('inherits the lead’s priority unless the conversion overrides it', async () => {
    const { service, db, orders } = build();
    withLead(db);
    await inTenant(() => service.convert('ld1', dto()));
    expect(punched(orders).priority).toBe('HIGH');
  });

  it('notes where the order came from', async () => {
    const { service, db, orders } = build();
    withLead(db);
    await inTenant(() => service.convert('ld1', dto()));
    expect(punched(orders).notes).toBe('Converted from lead LEAD-1');
  });

  it('links the lead to the order rather than consuming it', async () => {
    const { service, db } = build();
    withLead(db);
    await inTenant(() => service.convert('ld1', dto()));
    // The pipeline still has to answer how many enquiries became work.
    expect(db.lead.update.mock.calls[0][0].data).toMatchObject({ convertedOrderId: 'o1' });
    expect(db.lead.delete).not.toHaveBeenCalled();
  });

  it('parks the lead on the first DONE stage', async () => {
    const { service, db } = build();
    withLead(db);
    db.workflowStatus.findFirst = jest.fn(async () => ({ id: 'l9' }));
    await inTenant(() => service.convert('ld1', dto()));
    expect(db.workflowStatus.findFirst.mock.calls[0][0].where).toMatchObject({
      workflowId: 'w1',
      category: StatusCategory.DONE,
    });
    expect(db.lead.update.mock.calls[0][0].data.statusId).toBe('l9');
  });

  it('prefers an explicitly chosen closing stage', async () => {
    const { service, db } = build();
    withLead(db);
    db.workflowStatus.findFirst = jest.fn(async () => ({ id: 'l9' }));
    await inTenant(() => service.convert('ld1', dto({ convertedStatusId: 'l7' })));
    expect(db.lead.update.mock.calls[0][0].data.statusId).toBe('l7');
  });

  it('leaves the lead where it is when the pipeline has no closed stage', async () => {
    const { service, db } = build();
    withLead(db);
    await inTenant(() => service.convert('ld1', dto()));
    expect(db.lead.update.mock.calls[0][0].data).not.toHaveProperty('statusId');
    expect(db.leadStatusHistory.create).not.toHaveBeenCalled();
  });

  it('does not write a history row when the lead was already on the closing stage', async () => {
    const { service, db } = build();
    withLead(db, { statusId: 'l9' });
    db.workflowStatus.findFirst = jest.fn(async () => ({ id: 'l9' }));
    await inTenant(() => service.convert('ld1', dto()));
    expect(db.leadStatusHistory.create).not.toHaveBeenCalled();
  });

  it('records the move to the closing stage, naming the order', async () => {
    const { service, db } = build();
    withLead(db);
    db.workflowStatus.findFirst = jest.fn(async () => ({ id: 'l9' }));
    await inTenant(() => service.convert('ld1', dto()));
    expect(db.leadStatusHistory.create.mock.calls[0][0].data).toMatchObject({
      fromStatusId: 'l1',
      toStatusId: 'l9',
      note: 'Converted into ORD-1',
    });
  });
});

describe('board', () => {
  it('orders the columns the way the admin arranged them', async () => {
    const { service, db } = build();
    db.workflow.findFirst = jest.fn(async () => ({
      id: 'w1',
      code: 'PIPE',
      name: 'Pipeline',
      statuses: [
        { id: 'l2', sortOrder: 1 },
        { id: 'l1', sortOrder: 0 },
      ],
    }));
    const board = await service.board();
    expect(board.columns.map((c) => c.status.id)).toEqual(['l1', 'l2']);
  });

  /** The column is counted in two halves: quoted enquiries, and the rest. */
  function halves(
    db: Db,
    unquoted: { count: number; value: number },
    quoted: { count: number; value: number },
  ) {
    db.lead.aggregate = jest.fn(async (args: any) =>
      args.where.quotedValue === null
        ? { _count: { _all: unquoted.count }, _sum: { estimatedValue: unquoted.value } }
        : { _count: { _all: quoted.count }, _sum: { quotedValue: quoted.value } },
    );
  }

  it('caps each column but reports the whole stage’s count and value', async () => {
    const { service, db } = build();
    halves(db, { count: 137, value: 250000 }, { count: 0, value: 0 });
    const board = await service.board();
    expect(db.lead.findMany.mock.calls[0][0].take).toBe(20);
    // A pipeline figure that moved with how many cards happened to load would
    // be worthless.
    expect(board.columns[0]).toMatchObject({ total: 137, value: 250000 });
  });

  it('counts a quoted enquiry at what was quoted, not at the guess', async () => {
    const { service, db } = build();
    halves(db, { count: 2, value: 100000 }, { count: 1, value: 450000 });
    const board = await service.board();
    // The guess is what somebody thought when the phone was put down; the
    // quote is a number that went to the client.
    expect(board.columns[0]).toMatchObject({ total: 3, value: 550000 });
  });

  it('counts a quoted enquiry once, not in both halves', async () => {
    const { service, db } = build();
    halves(db, { count: 0, value: 0 }, { count: 4, value: 900000 });
    const board = await service.board();
    expect(board.columns[0]).toMatchObject({ total: 4, value: 900000 });
  });

  it('reports a stage with no leads as zero, not NaN', async () => {
    const { service, db } = build();
    db.lead.aggregate = jest.fn(async () => ({
      _count: { _all: 0 },
      _sum: { estimatedValue: null },
    }));
    const board = await service.board();
    expect(board.columns[0].value).toBe(0);
  });

  it('reports when no pipeline is configured', async () => {
    const { service, db } = build();
    db.workflow.findFirst = jest.fn(async () => null);
    await expect(service.board()).rejects.toThrow(/No lead pipeline is configured/);
  });
});

describe('enquiries that go quiet', () => {
  const query = (over: Record<string, unknown> = {}) =>
    ({ skip: 0, limit: 20, page: 1, ...over }) as never;

  /** A lead flow that archives anything untouched for `days`. */
  const expiresAfter = (db: Db, days: number | null) => {
    db.workflow.findFirst = jest.fn(async () => ({
      id: 'w1',
      code: 'PIPE',
      name: 'Pipeline',
      leadExpiryDays: days,
      statuses: [{ id: 'l1', name: 'New', isInitial: true, sortOrder: 0 }],
    }));
  };

  it('leaves every enquiry in the list when the flow sets no expiry', async () => {
    const { service, db } = build();
    expiresAfter(db, null);
    txReturns(db, [[], 0]);
    await service.list(query());
    expect(db.lead.findMany.mock.calls[0][0].where.NOT).toBeUndefined();
  });

  it('treats zero days as no expiry rather than archiving everything', async () => {
    const { service, db } = build();
    expiresAfter(db, 0);
    txReturns(db, [[], 0]);
    await service.list(query());
    expect(db.lead.findMany.mock.calls[0][0].where.NOT).toBeUndefined();
  });

  it('keeps the quiet ones out of the list', async () => {
    const { service, db } = build();
    expiresAfter(db, 30);
    txReturns(db, [[], 0]);
    await service.list(query());
    const not = db.lead.findMany.mock.calls[0][0].where.NOT;
    expect(not.convertedOrderId).toBeNull();
    expect(not.status).toEqual({ isTerminal: false });
    expect(not.updatedAt.lt).toBeInstanceOf(Date);
  });

  it('counts from when the enquiry was last touched, not when it arrived', async () => {
    const { service, db } = build();
    expiresAfter(db, 30);
    txReturns(db, [[], 0]);
    const before = Date.now();
    await service.list(query());
    const cutoff: Date = db.lead.findMany.mock.calls[0][0].where.NOT.updatedAt.lt;
    // Touch a quiet lead and it is live again, because the clock is its own
    // `updatedAt`.
    const days = (before - cutoff.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(30, 0);
  });

  it('shows only the quiet ones in the archive', async () => {
    const { service, db } = build();
    expiresAfter(db, 30);
    txReturns(db, [[], 0]);
    await service.list(query({ archived: true }));
    const where = db.lead.findMany.mock.calls[0][0].where;
    expect(where.updatedAt.lt).toBeInstanceOf(Date);
    expect(where.convertedOrderId).toBeNull();
    expect(where.status).toEqual({ isTerminal: false });
    expect(where.NOT).toBeUndefined();
  });

  it('never archives one that was won', async () => {
    const { service, db } = build();
    expiresAfter(db, 30);
    txReturns(db, [[], 0]);
    await service.list(query({ archived: true }));
    // A converted enquiry is not stale, it is done.
    expect(db.lead.findMany.mock.calls[0][0].where.convertedOrderId).toBeNull();
  });

  it('takes the quiet ones off the board too', async () => {
    const { service, db } = build();
    expiresAfter(db, 30);
    db.lead.aggregate = jest.fn(async () => ({ _count: { _all: 0 }, _sum: {} }));
    await service.board();
    // Otherwise the board and the list disagree about what is live.
    expect(db.lead.findMany.mock.calls[0][0].where.NOT.updatedAt.lt).toBeInstanceOf(Date);
  });

  it('leaves the board alone when nothing expires', async () => {
    const { service, db } = build();
    expiresAfter(db, null);
    db.lead.aggregate = jest.fn(async () => ({ _count: { _all: 0 }, _sum: {} }));
    await service.board();
    expect(db.lead.findMany.mock.calls[0][0].where.NOT).toBeUndefined();
  });
});

/*
 * An enquiry and the quote written for it are two doors into one job.
 *
 * Each route guarded only its own row, so a shop that converted the enquiry
 * and then pressed the button on its quote got two orders for one job — the
 * books showed ₹86,400 for ₹43,200 of work, and neither order said it was the
 * other one again. It also got two client records for one person, because the
 * enquiry went straight to its loose contact details rather than asking who
 * the quote was already written for.
 */
describe('convert — the quote that is already an order', () => {
  function withLead(db: Db, over: Record<string, unknown> = {}) {
    db.lead.findUnique = jest.fn(async () => ({
      id: 'ld1',
      code: 'LEAD-1',
      statusId: 'l1',
      workflowId: 'w1',
      priority: 'HIGH',
      clientId: null,
      contactName: 'Verma',
      contactPhone: '9820012345',
      contactEmail: null,
      company: 'Verma Interiors',
      title: 'Kitchen',
      customFields: {},
      convertedOrderId: null,
      estimates: [],
      ...over,
    }));
  }

  const quote = (over: Record<string, unknown> = {}) => ({
    id: 'e1',
    code: 'EST-1',
    orderId: null,
    clientId: null,
    ...over,
  });

  const dto = (over: Record<string, unknown> = {}) =>
    ({ location: 'Site A', items: [{ materialId: 'm1' }], ...over }) as never;

  it('refuses, naming the quote and the order it became', async () => {
    const { service, db } = build();
    withLead(db, { estimates: [quote({ orderId: 'o9' })] });
    db.order.findFirst = jest.fn(async () => ({ code: 'ORD-9' }));

    await expect(service.convert('ld1', dto())).rejects.toThrow(
      'LEAD-1 is already an order — EST-1 became ORD-9',
    );
  });

  it('punches nothing', async () => {
    const { service, db, orders } = build();
    withLead(db, { estimates: [quote({ orderId: 'o9' })] });
    db.order.findFirst = jest.fn(async () => ({ code: 'ORD-9' }));

    await expect(service.convert('ld1', dto())).rejects.toBeInstanceOf(BadRequestException);
    expect(orders.punch).not.toHaveBeenCalled();
  });

  it('still converts an enquiry whose quotes are all open', async () => {
    const { service, db, orders } = build();
    withLead(db, { estimates: [quote(), quote({ id: 'e2', code: 'EST-2' })] });

    await inTenant(() => service.convert('ld1', dto()));

    expect(orders.punch).toHaveBeenCalled();
  });

  /*
   * The second client, which the phone-number match could not prevent: the
   * record the quote screen made had no phone on it to match against.
   */
  describe('who it is for', () => {
    it('uses the client the quote was already written for', async () => {
      const { service, db, orders } = build();
      withLead(db, { estimates: [quote({ clientId: 'c-from-quote' })] });

      await inTenant(() => service.convert('ld1', dto()));

      const sent = orders.punch.mock.calls[0][0] as Record<string, unknown>;
      expect(sent).toMatchObject({ clientId: 'c-from-quote' });
      expect(sent.newClient).toBeUndefined();
    });

    it('prefers the enquiry’s own client over its quote’s', async () => {
      const { service, db, orders } = build();
      withLead(db, {
        clientId: 'c-on-lead',
        estimates: [quote({ clientId: 'c-from-quote' })],
      });

      await inTenant(() => service.convert('ld1', dto()));

      expect(orders.punch.mock.calls[0][0]).toMatchObject({ clientId: 'c-on-lead' });
    });

    it('falls back to the contact details when nobody is on the books yet', async () => {
      const { service, db, orders } = build();
      withLead(db, { estimates: [quote()] });

      await inTenant(() => service.convert('ld1', dto()));

      const sent = orders.punch.mock.calls[0][0] as Record<string, unknown>;
      expect(sent.newClient).toMatchObject({ name: 'Verma', phone: '9820012345' });
    });

    it('keeps the client on the enquiry afterwards', async () => {
      const { service, db, orders } = build();
      withLead(db, { estimates: [] });
      // Punching a new client hands one back; the enquiry has to keep it.
      orders.punch.mockResolvedValue({ id: 'o1', code: 'ORD-1', clientId: 'c-new' });

      await inTenant(() => service.convert('ld1', dto()));

      // Otherwise the very act of committing to somebody leaves the enquiry
      // still not knowing who they are — and a second conversion, or any later
      // screen, has only the loose contact fields to guess from.
      expect(db.lead.update.mock.calls[0][0].data).toMatchObject({ clientId: 'c-new' });
    });
  });
});
