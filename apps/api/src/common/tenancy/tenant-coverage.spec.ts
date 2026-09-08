import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TENANT_SCOPED_MODELS } from './tenant-clients';

/**
 * The list and the schema, kept honest against each other.
 *
 * A model that holds one shop's data and is missing from TENANT_SCOPED_MODELS
 * is not a small bug: its rows are read and written unfiltered, which means one
 * business seeing another's. Nothing about writing the model makes that
 * visible, so this reads the schema and asks the question for us.
 */
const schema = readFileSync(
  join(__dirname, '..', '..', '..', 'prisma', 'schema.prisma'),
  'utf8',
);

interface Model {
  name: string;
  body: string;
}

function models(): Model[] {
  const found: Model[] = [];
  const pattern = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(schema))) {
    found.push({ name: match[1], body: match[2] });
  }
  return found;
}

/** A field declaration, not a mention of tenantId in an index or a comment. */
const declaresTenantId = (model: Model) => /^\s*tenantId\s+\S/m.test(model.body);

describe('tenant scoping', () => {
  it('finds the models in the schema at all', () => {
    // Guards the parse itself: an empty list would make everything below pass.
    expect(models().length).toBeGreaterThan(30);
  });

  it('scopes every model that carries a tenantId', () => {
    const unscoped = models()
      .filter(declaresTenantId)
      .map((model) => model.name)
      .filter((name) => !TENANT_SCOPED_MODELS.has(name));

    expect(unscoped).toEqual([]);
  });

  it('scopes nothing that has no tenant to be scoped to', () => {
    const scopedWithout = models()
      .filter((model) => TENANT_SCOPED_MODELS.has(model.name) && !declaresTenantId(model))
      .map((model) => model.name);

    // Filtering by a column that does not exist fails every query at runtime.
    expect(scopedWithout).toEqual([]);
  });

  it('names only models that still exist', () => {
    const names = new Set(models().map((model) => model.name));
    const gone = [...TENANT_SCOPED_MODELS].filter((name) => !names.has(name));

    // A renamed model would otherwise leave its old name in the set, quietly
    // scoping nothing.
    expect(gone).toEqual([]);
  });
});
