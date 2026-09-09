import { StatusCategory, WorkflowKind } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_ROLES } from '@fas/shared';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

/**
 * Provisioning writes through a raw PrismaClient rather than the tenant-scoped
 * proxy, so the mock stands in for that client directly. Ids are handed back so
 * the workflow builder can wire transitions to the statuses it just made.
 */
function build() {
  const db = prismaMock() as never as Db;
  let n = 0;
  db.workflow.create = jest.fn(async () => ({ id: 'w1' }));
  db.workflowStatus.create = jest.fn(async (args: never) => {
    const data = (args as unknown as { data: { code: string } }).data;
    return { id: `st-${data.code}` };
  });
  db.material.create = jest.fn(async () => ({ id: `m${++n}` }));
  db.role.findFirst = jest.fn(async () => ({ id: 'role-owner' }));
  return { service: new TenantProvisioningService(), db };
}

const OWNER = { name: 'Nakul', code: 'nakul', password: 'admin123', email: 'A@B.COM' };

const dataOf = (mock: jest.Mock) =>
  mock.mock.calls.map((call) => call[0].data as Record<string, unknown>);

describe('seed', () => {
  it('gives every stock role to the new workspace', async () => {
    const { service, db } = build();
    await service.seed(db as never, 't1', OWNER);
    expect(dataOf(db.role.create).map((r) => r.code)).toEqual(
      DEFAULT_ROLES.map((r) => r.code),
    );
  });

  it('marks the stock roles as system roles, so upgrades can reconcile them', async () => {
    const { service, db } = build();
    await service.seed(db as never, 't1', OWNER);
    expect(dataOf(db.role.create).every((r) => r.isSystem)).toBe(true);
  });

  it('stamps the tenant on every seeded row', async () => {
    const { service, db } = build();
    await service.seed(db as never, 't1', OWNER);
    // Nothing here is shared between tenants; every row is a copy.
    for (const model of [
      'role',
      'gstSlab',
      'disbursementCategory',
      'material',
      'materialThickness',
      'sizePreset',
      'workflow',
      'workflowStatus',
      'workflowTransition',
      'leadSource',
      'customFieldDefinition',
      'user',
      'appSetting',
    ]) {
      const rows = dataOf(db[model].create);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.tenantId === 't1')).toBe(true);
    }
  });

  it('makes exactly one GST slab the default', async () => {
    const { service, db } = build();
    await service.seed(db as never, 't1', OWNER);
    const defaults = dataOf(db.gstSlab.create).filter((s) => s.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].ratePct).toBe(18);
  });

  it('names the payout ledger ISC until the tenant renames it', async () => {
    const { service, db } = build();
    await service.seed(db as never, 't1', OWNER);
    expect(dataOf(db.appSetting.create)).toContainEqual(
      expect.objectContaining({ key: 'disbursementLabel', value: 'ISC' }),
    );
  });

  it('gives every material at least one thickness to pick', async () => {
    const { service, db } = build();
    await service.seed(db as never, 't1', OWNER);
    const materials = dataOf(db.material.create);
    const thicknesses = dataOf(db.materialThickness.create);
    expect(materials.length).toBe(8);
    for (const material of materials) {
      expect(thicknesses.some((t) => t.materialId)).toBe(true);
    }
    expect(thicknesses.every((t) => Number(t.valueMm) > 0)).toBe(true);
  });

  it('stores size presets in millimetres', async () => {
    const { service, db } = build();
    await service.seed(db as never, 't1', OWNER);
    const sheet = dataOf(db.sizePreset.create).find((p) => p.code === 'SHEET-8X4')!;
    expect(Number(sheet.lengthMm)).toBeCloseTo(2438.4, 1);
    expect(Number(sheet.widthMm)).toBeCloseTo(1219.2, 1);
  });

  it('builds an order journey and a lead pipeline, each its own default', async () => {
    const { service, db } = build();
    await service.seed(db as never, 't1', OWNER);
    const workflows = dataOf(db.workflow.create);
    expect(workflows.map((w) => w.kind)).toEqual([WorkflowKind.ORDER, WorkflowKind.LEAD]);
    expect(workflows.every((w) => w.isDefault)).toBe(true);
  });

  it('gives each workflow exactly one starting stage', async () => {
    const { service, db } = build();
    await service.seed(db as never, 't1', OWNER);
    const initial = dataOf(db.workflowStatus.create).filter((s) => s.isInitial);
    expect(initial.map((s) => s.code)).toEqual(['LEAD', 'NEW_ENQUIRY']);
  });

  it('marks a second entry point on the order journey, for a straight punch', async () => {
    const { service, db } = build();
    await service.seed(db as never, 't1', OWNER);
    const entries = dataOf(db.workflowStatus.create).filter(
      (s) => s.isEntryPoint && !s.isInitial,
    );
    // A punched order was never an enquiry — it starts at "Order confirmed".
    expect(entries.map((s) => s.code)).toContain('ORDER_FINAL');
  });

  it('wires every transition to statuses it actually created', async () => {
    const { service, db } = build();
    await service.seed(db as never, 't1', OWNER);
    const ids = new Set(dataOf(db.workflowStatus.create).map((s) => `st-${s.code}`));
    for (const move of dataOf(db.workflowTransition.create)) {
      expect(ids.has(move.fromStatusId as string)).toBe(true);
      expect(ids.has(move.toStatusId as string)).toBe(true);
    }
  });

  it('never draws a transition into a stage from itself', async () => {
    const { service, db } = build();
    await service.seed(db as never, 't1', OWNER);
    for (const move of dataOf(db.workflowTransition.create)) {
      expect(move.fromStatusId).not.toBe(move.toStatusId);
    }
  });

  it('requires a note on every move into a cancelled stage', async () => {
    const { service, db } = build();
    await service.seed(db as never, 't1', OWNER);
    const cancelled = dataOf(db.workflowStatus.create)
      .filter((s) => s.category === StatusCategory.CANCELLED)
      .map((s) => `st-${s.code}`);
    const intoCancelled = dataOf(db.workflowTransition.create).filter((m) =>
      cancelled.includes(m.toStatusId as string),
    );
    expect(intoCancelled.length).toBeGreaterThan(0);
    expect(intoCancelled.every((m) => m.requiresNote)).toBe(true);
  });

  it('seeds a select custom field with its options', async () => {
    const { service, db } = build();
    await service.seed(db as never, 't1', OWNER);
    const band = dataOf(db.customFieldDefinition.create).find((f) => f.key === 'budget_band')!;
    expect(band.options).toEqual(['Under 1L', '1-5L', '5-10L', '10L+']);
  });

  it('normalises the owner’s sign-in code and email', async () => {
    const { service, db } = build();
    await service.seed(db as never, 't1', OWNER);
    const user = dataOf(db.user.create)[0];
    expect(user.code).toBe('NAKUL');
    expect(user.email).toBe('a@b.com');
  });

  it('hashes the owner’s password and attaches the owner role', async () => {
    const { service, db } = build();
    await service.seed(db as never, 't1', OWNER);
    const user = dataOf(db.user.create)[0];
    expect(user.passwordHash).not.toBe('admin123');
    await expect(bcrypt.compare('admin123', user.passwordHash as string)).resolves.toBe(true);
    expect(user.roleId).toBe('role-owner');
  });

  it('leaves the owner usable even if the role lookup came back empty', async () => {
    const { service, db } = build();
    db.role.findFirst = jest.fn(async () => null);
    await service.seed(db as never, 't1', OWNER);
    expect(dataOf(db.user.create)[0].roleId).toBeUndefined();
  });
});

describe('syncSystemRoles', () => {
  it('adds a permission a later release introduced', async () => {
    const { service, db } = build();
    const role = DEFAULT_ROLES[0];
    db.role.findFirst = jest.fn(async (args: never) => {
      const where = (args as unknown as { where: { code: string } }).where;
      if (where.code !== role.code) return null;
      // Everything except the last permission — as if seeded before it existed.
      return { id: 'r1', permissions: role.permissions.slice(0, -1) };
    });

    const changed = await service.syncSystemRoles(db as never, 't1');
    expect(changed).toBe(1);
    expect(db.role.update.mock.calls[0][0].data.permissions).toEqual(role.permissions);
  });

  it('writes nothing when every stock role is already current', async () => {
    const { service, db } = build();
    db.role.findFirst = jest.fn(async (args: never) => {
      const code = (args as unknown as { where: { code: string } }).where.code;
      const role = DEFAULT_ROLES.find((r) => r.code === code)!;
      return { id: code, permissions: [...role.permissions] };
    });
    await expect(service.syncSystemRoles(db as never, 't1')).resolves.toBe(0);
    expect(db.role.update).not.toHaveBeenCalled();
  });

  it('only looks at system roles — a tenant’s own roles are theirs', async () => {
    const { service, db } = build();
    db.role.findFirst = jest.fn(async () => null);
    await service.syncSystemRoles(db as never, 't1');
    for (const call of db.role.findFirst.mock.calls) {
      expect(call[0].where.isSystem).toBe(true);
      expect(call[0].where.tenantId).toBe('t1');
    }
  });

  it('keeps a permission the tenant added on top of a system role', async () => {
    const { service, db } = build();
    const role = DEFAULT_ROLES[0];
    db.role.findFirst = jest.fn(async (args: never) => {
      const where = (args as unknown as { where: { code: string } }).where;
      if (where.code !== role.code) return null;
      return { id: 'r1', permissions: [...role.permissions.slice(0, -1), 'custom.thing'] };
    });
    await service.syncSystemRoles(db as never, 't1');
    expect(db.role.update.mock.calls[0][0].data.permissions).toContain('custom.thing');
  });

  it('skips a role the workspace does not have', async () => {
    const { service, db } = build();
    db.role.findFirst = jest.fn(async () => null);
    await expect(service.syncSystemRoles(db as never, 't1')).resolves.toBe(0);
  });
});


/**
 * The two stages a lead pipeline names.
 *
 * A shop that never opens the flow screen should still have a quote move the
 * enquiry and a refusal close it.
 */
describe('what a new lead pipeline points at', () => {
  it('names the stage a quote goes out at, and the one a refusal ends at', async () => {
    const { service, db } = build();
    await service.seed(db as never, 't1', OWNER);

    expect(dataOf(db.workflow.update)).toEqual([
      { quoteStatusId: 'st-QUOTED', lostStatusId: 'st-LOST' },
    ]);
  });

  it('leaves the order flow pointing at neither, since orders are not quoted', async () => {
    const { service, db } = build();
    await service.seed(db as never, 't1', OWNER);
    // Only the lead pipeline names them.
    expect(db.workflow.update).toHaveBeenCalledTimes(1);
  });
});
