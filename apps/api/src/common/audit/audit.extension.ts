import { Logger } from '@nestjs/common';
import { currentActor, currentAuditNote } from './audit-context';
import {
  AUDITED_MODELS,
  BELONGS_TO,
  MAX_ROWS_PER_WRITE,
  MAX_VALUE_LENGTH,
  NEVER_LOGGED,
} from './audited-models';

const logger = new Logger('Audit');

type Row = Record<string, unknown>;

/** What happened, in a word, from the operation that did it. */
const VERB: Record<string, string> = {
  create: 'created',
  createMany: 'created',
  update: 'updated',
  updateMany: 'updated',
  upsert: 'updated',
  delete: 'deleted',
  deleteMany: 'deleted',
};

/** Columns that change on their own and say nothing about who changed what. */
const NOT_A_CHANGE = new Set(['updatedAt', 'tenantId']);

/**
 * The trail, written underneath everything.
 *
 * Every service goes through the same client, so putting this here rather than
 * in each service is the whole point: a developer adding a new write cannot
 * forget to record it, because there is no write path that bypasses this. The
 * cost is one extra read before an update — cheap next to being unable to
 * answer "who changed this order's rate, and when".
 *
 * Two things it deliberately does not do. It records only what changed, not the
 * whole row, so a history stays readable. And it never fails a business
 * operation: if the trail cannot be written the change still stands and the
 * failure is logged, because a shop that cannot punch an order because a log
 * table is full is a worse outcome than a gap in the log.
 */
export function auditExtension(inner: unknown, tenantId: string) {
  const client = inner as Record<string, Record<string, (args: unknown) => Promise<unknown>>>;

  return {
    name: 'audit',
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model?: string;
          operation: string;
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
        }) {
          if (!model || !AUDITED_MODELS.has(model) || !(operation in VERB)) {
            return query(args);
          }

          const table = client[lowerFirst(model)];
          const input = (args ?? {}) as Row;
          const before = await readBefore(table, operation, input);

          const result = await query(args);

          try {
            const entries = await describe(table, model, operation, input, before, result);
            await Promise.all(entries.map((entry) => write(client, tenantId, entry)));
          } catch (error) {
            logger.error(
              `Could not record a ${model} ${VERB[operation]}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }

          return result;
        },
      },
    },
  };
}

interface Entry {
  entity: string;
  entityId: string;
  entityCode: string | null;
  action: string;
  before: Row | null;
  after: Row | null;
  /** The order, client or quote this row hangs off, when it hangs off one. */
  rootEntity?: string | null;
  rootId?: string | null;
}

/** What is there now, read before the write changes it. */
async function readBefore(
  table: Record<string, (args: unknown) => Promise<unknown>>,
  operation: string,
  input: Row,
): Promise<Row | Row[] | null> {
  try {
    if (operation === 'update' || operation === 'delete' || operation === 'upsert') {
      return (await table.findUnique({ where: input.where })) as Row | null;
    }
    if (operation === 'updateMany' || operation === 'deleteMany') {
      return (await table.findMany({
        where: input.where ?? {},
        // A bulk write over the whole table would otherwise pull it into memory.
        take: MAX_ROWS_PER_WRITE + 1,
      })) as Row[];
    }
  } catch {
    // A row that cannot be read before the write is recorded without a before.
    // Losing the "from" half beats losing the entry.
  }
  return null;
}

async function describe(
  table: Record<string, (args: unknown) => Promise<unknown>>,
  model: string,
  operation: string,
  input: Row,
  before: Row | Row[] | null,
  result: unknown,
): Promise<Entry[]> {
  const action = currentAuditNote()?.action ?? `${lowerFirst(model)}.${VERB[operation]}`;
  const parent = BELONGS_TO[model];
  const rows = [result, before].flat() as (Row | null)[];
  const rootId = parent
    ? (rows.find((row) => row && row[parent.field])?.[parent.field] as string | undefined) ?? null
    : null;

  const entry = (over: Partial<Entry>): Entry => ({
    entity: model,
    entityId: '',
    entityCode: null,
    action,
    before: null,
    after: null,
    // Read off the row itself rather than off the arguments: an update that
    // never mentions the order still belongs to it.
    rootEntity: parent && rootId ? parent.entity : null,
    rootId,
    ...over,
  });

  if (operation === 'create') {
    const after = result as Row;
    return [
      entry({ entityId: id(after), entityCode: code(after), after: redact(after) }),
    ];
  }

  if (operation === 'createMany') {
    // createMany returns a count and no rows, so there is nothing to point at.
    // One summary entry says a bulk insert happened and how big it was.
    const count = (result as { count?: number })?.count ?? 0;
    return [entry({ entityId: 'many', after: { created: count } })];
  }

  if (operation === 'update' || operation === 'upsert') {
    const after = result as Row;
    const from = (before ?? null) as Row | null;
    // An upsert that found nothing created the row.
    if (!from) {
      return [entry({ entityId: id(after), entityCode: code(after), after: redact(after) })];
    }
    const change = changed(from, after);
    if (!change) return [];
    return [
      entry({ entityId: id(after), entityCode: code(after), ...change }),
    ];
  }

  if (operation === 'delete') {
    const from = (before ?? (result as Row)) as Row;
    return [entry({ entityId: id(from), entityCode: code(from), before: redact(from) })];
  }

  const affectedRows = (before ?? []) as Row[];
  if (affectedRows.length > MAX_ROWS_PER_WRITE) {
    // Too many to keep one by one. The operation's own count is the honest
    // number here — the rows read back were capped.
    const affected = (result as { count?: number })?.count ?? affectedRows.length;
    return [entry({ entityId: 'many', after: { affected } })];
  }

  if (operation === 'deleteMany') {
    return affectedRows.map((row) =>
      entry({ entityId: id(row), entityCode: code(row), before: redact(row) }),
    );
  }

  // updateMany: read the same rows back, so each entry is a real before/after.
  const ids = affectedRows.map(id).filter(Boolean);
  const after = ids.length
    ? ((await table.findMany({ where: { id: { in: ids } } })) as Row[])
    : [];
  const byId = new Map(after.map((row) => [id(row), row]));

  return affectedRows
    .map((row) => {
      const now = byId.get(id(row));
      const change = now ? changed(row, now) : null;
      return change ? entry({ entityId: id(row), entityCode: code(row), ...change }) : null;
    })
    .filter((one): one is Entry => one !== null);
}

async function write(
  client: Record<string, Record<string, (args: unknown) => Promise<unknown>>>,
  tenantId: string,
  entry: Entry,
): Promise<void> {
  const actor = currentActor();
  await client.auditLog.create({
    data: {
      tenantId,
      entity: entry.entity,
      entityId: entry.entityId,
      entityCode: entry.entityCode,
      action: entry.action,
      before: entry.before ?? undefined,
      after: entry.after ?? undefined,
      rootEntity: entry.rootEntity ?? null,
      rootId: entry.rootId ?? null,
      reason: currentAuditNote()?.reason ?? null,
      // A platform admin has no row in this workspace's user table, so they are
      // named rather than pointed at.
      userId: actor?.userId ?? null,
      actorLabel: actor?.name ?? actor?.code ?? null,
    },
  });
}

/** Only the fields that actually differ, both sides of them. */
export function changed(
  before: Row,
  after: Row,
): { before: Row; after: Row } | null {
  const from: Row = {};
  const to: Row = {};

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (NOT_A_CHANGE.has(key) || NEVER_LOGGED.has(key)) continue;
    if (same(before[key], after[key])) continue;
    from[key] = summarise(before[key]);
    to[key] = summarise(after[key]);
  }

  // An update that set a column to what it already held is not a change, and a
  // history full of those is a history nobody reads.
  return Object.keys(to).length ? { before: from, after: to } : null;
}

/** Prisma hands back Decimals and Dates; compare what they say, not what they are. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(summarise(a)) === JSON.stringify(summarise(b));
  }
  return String(a) === String(b);
}

/** A value small enough and plain enough to live in a log row. */
function summarise(value: unknown): unknown {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    return value.length > MAX_VALUE_LENGTH
      ? `${value.slice(0, MAX_VALUE_LENGTH)}… (${value.length} characters)`
      : value;
  }
  if (typeof value === 'object') {
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      return '[binary]';
    }
    // Decimal and anything else with a useful toString.
    const asString = String(value);
    if (asString !== '[object Object]') return asString;
    return redact(value as Row);
  }
  return value;
}

export function redact(row: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row ?? {})) {
    if (NEVER_LOGGED.has(key)) continue;
    out[key] = summarise(value);
  }
  return out;
}

const id = (row: Row | null | undefined): string => String(row?.id ?? '');

/** Something a person recognises: an order code, a client's name. */
const code = (row: Row | null | undefined): string | null => {
  const value = row?.code ?? row?.name ?? null;
  return typeof value === 'string' ? value : null;
};

const lowerFirst = (name: string): string => name.charAt(0).toLowerCase() + name.slice(1);
