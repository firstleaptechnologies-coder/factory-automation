import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { inTenant, prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build() {
  const db = prismaMock() as never as Db;
  return { service: new WorkflowsService(db as never), db };
}

const STATUSES = [
  { id: 's1', workflowId: 'w1', parentId: null },
  { id: 's2', workflowId: 'w1', parentId: null },
  { id: 's3', workflowId: 'w1', parentId: null },
];

function withWorkflow(db: Db, statuses = STATUSES) {
  db.workflow.findUnique = jest.fn(async () => ({
    id: 'w1',
    name: 'Production',
    statuses,
    transitions: [],
  }));
}

describe('findOne', () => {
  it('reports a missing workflow rather than returning null', async () => {
    const { service } = build();
    await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the graph when it exists', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await expect(service.findOne('w1')).resolves.toMatchObject({ id: 'w1' });
  });
});

describe('getDefault', () => {
  it('explains that an admin must create one first', async () => {
    const { service } = build();
    // Punching resolves the initial status from here, so the message has to be
    // actionable rather than a bare 404.
    await expect(service.getDefault()).rejects.toThrow(/default order workflow/i);
  });

  it('says which kind is missing, since a shop has one of each', async () => {
    const { service } = build();
    await expect(service.getDefault('LEAD' as never)).rejects.toThrow(/default lead workflow/i);
  });

  it('returns the active default', async () => {
    const { service, db } = build();
    db.workflow.findFirst = jest.fn(async () => ({ id: 'w1', isDefault: true }));
    await expect(service.getDefault()).resolves.toMatchObject({ id: 'w1' });
    expect(db.workflow.findFirst.mock.calls[0][0]).toMatchObject({
      where: { isDefault: true, isActive: true },
    });
  });
});

describe('create', () => {
  it('makes the very first workflow the default', async () => {
    const { service, db } = build();
    db.workflow.count = jest.fn(async () => 0);
    await inTenant(() => service.create({ name: 'Production' } as never));
    expect(db.workflow.create.mock.calls[0][0].data).toMatchObject({
      isDefault: true,
      tenantId: 'tenant-test',
    });
  });

  it('does not steal the default from an existing workflow', async () => {
    const { service, db } = build();
    db.workflow.count = jest.fn(async () => 2);
    await inTenant(() => service.create({ name: 'Repairs' } as never));
    expect(db.workflow.create.mock.calls[0][0].data).toMatchObject({ isDefault: false });
  });
});

describe('setDefault', () => {
  it('clears every other default in the same transaction', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await service.setDefault('w1');
    expect(db.workflow.updateMany).toHaveBeenCalledWith({
      where: { isDefault: true },
      data: { isDefault: false },
    });
    expect(db.workflow.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { isDefault: true },
    });
  });

  it('refuses an unknown workflow before touching anything', async () => {
    const { service, db } = build();
    await expect(service.setDefault('ghost')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.workflow.updateMany).not.toHaveBeenCalled();
  });
});

describe('addStatus', () => {
  it('applies the defaults a bare status needs to render', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await inTenant(() => service.addStatus('w1', { code: 'CUT', name: 'Cutting' } as never));
    expect(db.workflowStatus.create.mock.calls[0][0].data).toMatchObject({
      workflowId: 'w1',
      code: 'CUT',
      color: '#6B7785',
      category: 'OPEN',
      isInitial: false,
      isTerminal: false,
      canvasX: 0,
      canvasY: 0,
    });
  });

  it('demotes the previous initial status when a new one claims it', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await inTenant(() =>
      service.addStatus('w1', { code: 'NEW', name: 'New', isInitial: true } as never),
    );
    // Two statuses claiming "initial" would make punching ambiguous.
    expect(db.workflowStatus.updateMany).toHaveBeenCalledWith({
      where: { workflowId: 'w1', isInitial: true },
      data: { isInitial: false },
    });
  });

  it('leaves the existing initial alone for an ordinary status', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await inTenant(() => service.addStatus('w1', { code: 'CUT', name: 'Cutting' } as never));
    expect(db.workflowStatus.updateMany).not.toHaveBeenCalled();
  });
});

describe('updateStatus', () => {
  it('refuses a status that does not exist', async () => {
    const { service } = build();
    await expect(service.updateStatus('ghost', {} as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to make a status its own parent', async () => {
    const { service, db } = build();
    db.workflowStatus.findUnique = jest.fn(async () => ({ id: 's1', workflowId: 'w1' }));
    await expect(service.updateStatus('s1', { parentId: 's1' } as never)).rejects.toThrow(
      /own parent/i,
    );
  });

  it('refuses a re-parent that would close a loop', async () => {
    const { service, db } = build();
    // s1 -> s2 -> s1 : walking up from s2 comes back to s1.
    const parents: Record<string, string | null> = { s2: 's3', s3: 's1' };
    db.workflowStatus.findUnique = jest.fn(async (args: never) => {
      const id = (args as unknown as { where: { id: string } }).where.id;
      if (id === 's1') return { id: 's1', workflowId: 'w1' };
      return { parentId: parents[id] ?? null };
    });
    await expect(service.updateStatus('s1', { parentId: 's2' } as never)).rejects.toThrow(
      /loop/i,
    );
  });

  it('allows a re-parent that stays a tree', async () => {
    const { service, db } = build();
    db.workflowStatus.findUnique = jest.fn(async (args: never) => {
      const id = (args as unknown as { where: { id: string } }).where.id;
      if (id === 's1') return { id: 's1', workflowId: 'w1' };
      return { parentId: null };
    });
    await service.updateStatus('s1', { parentId: 's2' } as never);
    expect(db.workflowStatus.update).toHaveBeenCalled();
  });

  it('keeps parentId untouched when the caller omits it', async () => {
    const { service, db } = build();
    db.workflowStatus.findUnique = jest.fn(async () => ({ id: 's1', workflowId: 'w1' }));
    await service.updateStatus('s1', { name: 'Renamed' } as never);
    // `undefined` is Prisma's "leave alone"; `null` would orphan the status.
    expect(db.workflowStatus.update.mock.calls[0][0].data.parentId).toBeUndefined();
  });

  it('can detach a status by passing null', async () => {
    const { service, db } = build();
    db.workflowStatus.findUnique = jest.fn(async () => ({ id: 's1', workflowId: 'w1' }));
    await service.updateStatus('s1', { parentId: null } as never);
    expect(db.workflowStatus.update.mock.calls[0][0].data.parentId).toBeNull();
  });

  it('demotes the other initial, but not itself', async () => {
    const { service, db } = build();
    db.workflowStatus.findUnique = jest.fn(async () => ({ id: 's1', workflowId: 'w1' }));
    await service.updateStatus('s1', { isInitial: true } as never);
    expect(db.workflowStatus.updateMany.mock.calls[0][0].where).toMatchObject({
      workflowId: 'w1',
      isInitial: true,
      id: { not: 's1' },
    });
  });
});

describe('removeStatus', () => {
  const held = (over: Record<string, unknown>) => ({
    id: 's1',
    name: 'Cutting',
    _count: { ordersAtStatus: 0, children: 0, ...over },
  });

  it('refuses while orders still sit in it, and says how many', async () => {
    const { service, db } = build();
    db.workflowStatus.findUnique = jest.fn(async () => held({ ordersAtStatus: 3 }));
    await expect(service.removeStatus('s1')).rejects.toThrow(/Cutting still holds 3 order/);
    expect(db.workflowStatus.delete).not.toHaveBeenCalled();
  });

  it('refuses while sub-statuses hang off it', async () => {
    const { service, db } = build();
    db.workflowStatus.findUnique = jest.fn(async () => held({ children: 2 }));
    await expect(service.removeStatus('s1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deletes an empty leaf status', async () => {
    const { service, db } = build();
    db.workflowStatus.findUnique = jest.fn(async () => held({}));
    await service.removeStatus('s1');
    expect(db.workflowStatus.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('reports a missing status', async () => {
    const { service } = build();
    await expect(service.removeStatus('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('saveGraph', () => {
  const graph = (transitions: unknown[], positions: unknown[] = []) =>
    ({ transitions, positions }) as never;

  it('replaces the edge set wholesale so the saved flow matches the canvas', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await inTenant(() =>
      service.saveGraph('w1', graph([{ fromStatusId: 's1', toStatusId: 's2' }])),
    );
    expect(db.workflowTransition.deleteMany).toHaveBeenCalledWith({
      where: { workflowId: 'w1' },
    });
    expect(db.workflowTransition.createMany.mock.calls[0][0].data).toEqual([
      {
        tenantId: 'tenant-test',
        workflowId: 'w1',
        fromStatusId: 's1',
        toStatusId: 's2',
        label: undefined,
        requiresNote: false,
        allowedRoles: [],
      },
    ]);
  });

  it('collapses a duplicated edge, keeping the last one drawn', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await inTenant(() =>
      service.saveGraph(
        'w1',
        graph([
          { fromStatusId: 's1', toStatusId: 's2', label: 'first' },
          { fromStatusId: 's1', toStatusId: 's2', label: 'second' },
        ]),
      ),
    );
    // The table has a unique index on the pair, so a duplicate would 500.
    const rows = db.workflowTransition.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('second');
  });

  it('refuses an edge pointing outside this workflow', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await expect(
      inTenant(() => service.saveGraph('w1', graph([{ fromStatusId: 's1', toStatusId: 'sX' }]))),
    ).rejects.toThrow(/not part of this workflow/i);
    expect(db.workflowTransition.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses a self-loop', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await expect(
      inTenant(() => service.saveGraph('w1', graph([{ fromStatusId: 's1', toStatusId: 's1' }]))),
    ).rejects.toThrow(/cannot transition to itself/i);
  });

  it('validates every edge before deleting any, so a bad one is not destructive', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await expect(
      inTenant(() =>
        service.saveGraph(
          'w1',
          graph([
            { fromStatusId: 's1', toStatusId: 's2' },
            { fromStatusId: 's2', toStatusId: 'sX' },
          ]),
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.workflowTransition.deleteMany).not.toHaveBeenCalled();
  });

  it('saves canvas positions and ignores nodes from elsewhere', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await inTenant(() =>
      service.saveGraph(
        'w1',
        graph([], [
          { id: 's1', canvasX: 10, canvasY: 20 },
          { id: 'sX', canvasX: 99, canvasY: 99 },
        ]),
      ),
    );
    expect(db.workflowStatus.update).toHaveBeenCalledTimes(1);
    expect(db.workflowStatus.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { canvasX: 10, canvasY: 20 },
    });
  });

  it('clears every edge when the canvas has none left', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await inTenant(() => service.saveGraph('w1', graph([])));
    expect(db.workflowTransition.deleteMany).toHaveBeenCalled();
    expect(db.workflowTransition.createMany).not.toHaveBeenCalled();
  });
});

describe('allowedNext', () => {
  it('asks only for moves leaving the given status', async () => {
    const { service, db } = build();
    await service.allowedNext('s1');
    expect(db.workflowTransition.findMany.mock.calls[0][0]).toMatchObject({
      where: { fromStatusId: 's1' },
    });
  });
});

describe('allowedBack', () => {
  it('asks for the moves into the given status', async () => {
    const { service, db } = build();
    await service.allowedBack('s2');
    // Going back is retracing an arrow that exists, so the moves back are
    // exactly the moves in.
    expect(db.workflowTransition.findMany.mock.calls[0][0]).toMatchObject({
      where: { toStatusId: 's2' },
    });
  });

  it('answers with the stage each one came from', async () => {
    const { service, db } = build();
    db.workflowTransition.findMany = jest.fn(async () => [
      { id: 't1', fromStatus: { id: 's1', name: 'Design' } },
    ]);
    expect(await service.allowedBack('s2')).toEqual([
      { transitionId: 't1', toStatus: { id: 's1', name: 'Design' } },
    ]);
  });
});

describe('update', () => {
  it('sets how long an enquiry may sit before it goes quiet', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await inTenant(() => service.update('w1', { leadExpiryDays: 30 } as never));
    expect(db.workflow.update.mock.calls[0][0].data).toEqual({ leadExpiryDays: 30 });
  });

  it('names the stage that means a quote has gone out', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await inTenant(() => service.update('w1', { quoteStatusId: 's2' } as never));
    expect(db.workflow.update.mock.calls[0][0].data).toEqual({ quoteStatusId: 's2' });
  });

  it('refuses a stage from some other flow', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await expect(
      inTenant(() => service.update('w1', { quoteStatusId: 'elsewhere' } as never)),
    ).rejects.toThrow(/does not belong to this flow/);
  });

  it('unsets it, so sending a quote moves nothing', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await inTenant(() => service.update('w1', { quoteStatusId: null } as never));
    expect(db.workflow.update.mock.calls[0][0].data).toEqual({ quoteStatusId: null });
  });

  it('turns it off when it is set to nothing', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await inTenant(() => service.update('w1', { leadExpiryDays: 0 } as never));
    // Zero reads as never, which is how a shop turns archiving off.
    expect(db.workflow.update.mock.calls[0][0].data).toEqual({ leadExpiryDays: null });
  });

  it('leaves it alone when the change was about something else', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await inTenant(() => service.update('w1', { name: 'Enquiries' } as never));
    expect(db.workflow.update.mock.calls[0][0].data).toEqual({ name: 'Enquiries' });
  });

  it('reports a flow that is not there', async () => {
    const { service } = build();
    await expect(service.update('nope', { name: 'x' } as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('setHomeCard', () => {
  it('puts the chosen stages on the card in the order they were given', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await inTenant(() => service.setHomeCard('w1', ['s3', 's1']));
    const written = db.workflowStatus.update.mock.calls.map((call) => [
      call[0].where.id,
      call[0].data.homeCardOrder,
    ]);
    // The position on the card is the place in the list, not the flow order.
    expect(written).toEqual([
      ['s3', 0],
      ['s1', 1],
    ]);
  });

  it('takes the stages that are no longer chosen off it', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await inTenant(() => service.setHomeCard('w1', ['s1']));
    expect(db.workflowStatus.updateMany).toHaveBeenCalledWith({
      where: { workflowId: 'w1', homeCardOrder: { not: null } },
      data: { homeCardOrder: null },
    });
  });

  it('empties the card when nothing is chosen', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await inTenant(() => service.setHomeCard('w1', []));
    expect(db.workflowStatus.updateMany).toHaveBeenCalled();
    expect(db.workflowStatus.update).not.toHaveBeenCalled();
  });

  it('refuses a stage from another workflow', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await expect(inTenant(() => service.setHomeCard('w1', ['s1', 'elsewhere']))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.workflowStatus.updateMany).not.toHaveBeenCalled();
  });

  it('refuses the same stage twice, which would claim two positions', async () => {
    const { service, db } = build();
    withWorkflow(db);
    await expect(inTenant(() => service.setHomeCard('w1', ['s1', 's1']))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses more stages than the card holds', async () => {
    const { service, db } = build();
    withWorkflow(db, [...STATUSES, { id: 's4', workflowId: 'w1', parentId: null }, { id: 's5', workflowId: 'w1', parentId: null }, { id: 's6', workflowId: 'w1', parentId: null }]);
    await expect(
      inTenant(() => service.setHomeCard('w1', ['s1', 's2', 's3', 's4', 's5', 's6'])),
    ).rejects.toThrow(/holds 5 stages/);
  });

  it('takes exactly the five the card holds', async () => {
    const { service, db } = build();
    withWorkflow(db, [...STATUSES, { id: 's4', workflowId: 'w1', parentId: null }, { id: 's5', workflowId: 'w1', parentId: null }]);
    await inTenant(() => service.setHomeCard('w1', ['s1', 's2', 's3', 's4', 's5']));
    expect(db.workflowStatus.update).toHaveBeenCalledTimes(5);
  });
});

describe('the default flow', () => {
  it('is the one orders run on, not the enquiry pipeline', async () => {
    const { service, db } = build();
    db.workflow.findFirst = jest.fn(async () => ({ id: 'w1', statuses: [], transitions: [] }));
    await inTenant(() => service.getDefault());
    // A shop has a default of each kind; whichever row came back first would
    // otherwise decide what the orders list filters by.
    expect(db.workflow.findFirst.mock.calls[0][0].where).toMatchObject({
      kind: 'ORDER',
      isDefault: true,
      isActive: true,
    });
  });
});

describe('the counts the home card reads', () => {
  it('come back with the default workflow, so the card costs no extra call', async () => {
    const { service, db } = build();
    db.workflow.findFirst = jest.fn(async () => ({ id: 'w1', statuses: [], transitions: [] }));
    await inTenant(() => service.getDefault());
    const include = db.workflow.findFirst.mock.calls[0][0].include;
    expect(include.statuses.include).toEqual({
      _count: { select: { ordersAtStatus: true } },
    });
  });
});
