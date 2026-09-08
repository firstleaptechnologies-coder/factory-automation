import { TenantIsolation } from '@prisma/client';
import { runInTenant } from '../src/common/tenancy/tenant-context';

/**
 * A hand-rolled stand-in for PrismaService.
 *
 * These tests are about our rules — what is refused, what is derived — not
 * about Prisma. So each model is a bag of jest mocks the test arranges, and
 * `$transaction` simply runs the callback against the same bag: the services
 * use transactions for atomicity, which is the database's job to prove, not
 * ours.
 */
export type ModelMock = Record<string, jest.Mock>;

const MODELS = [
  'order',
  'orderItem',
  'payment',
  'cashDeposit',
  'client',
  'clientLocation',
  'material',
  'materialThickness',
  'sizePreset',
  'gstSlab',
  'workflow',
  'workflowStatus',
  'workflowTransition',
  'orderStatusHistory',
  'lead',
  'leadStatusHistory',
  'leadSource',
  'customFieldDefinition',
  'user',
  'role',
  'appSetting',
  'documentSequence',
  'disbursement',
  'disbursementCategory',
  'estimate',
  'estimateItem',
  'firmProfile',
  'storedFile',
  'orderAttachment',
  'tenant',
  'platformUser',
  'auditLog',
  'jobLease',
  'jobRun',
  'serverLog',
  'clientLog',
  'otaRelease',
  'otaReleaseAsset',
  'appVersionGate',
];

const OPERATIONS = [
  'findUnique',
  'findFirst',
  'findMany',
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
];

export function prismaMock() {
  // Holds model bags, `$transaction` and `platform` side by side, so the value
  // type is the union of all three rather than a model bag.
  const db: Record<string, unknown> = {};

  for (const model of MODELS) {
    const bag: ModelMock = {};
    for (const operation of OPERATIONS) {
      // Sensible empty defaults, so a test only arranges what it cares about.
      bag[operation] = jest.fn(async () => {
        if (operation === 'findMany' || operation === 'groupBy') return [];
        if (operation === 'count') return 0;
        if (operation === 'aggregate') return { _sum: {}, _count: 0 };
        return null;
      });
    }
    db[model] = bag;
  }

  db.$transaction = jest.fn(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : arg,
  );
  db.platform = db;

  return db as never;
}

/** Runs a test body inside a tenant, as every request does. */
export function inTenant<T>(fn: () => T): T {
  return runInTenant(
    { tenantId: 'tenant-test', slug: 'test-shop', isolation: TenantIsolation.SHARED },
    fn,
  );
}
