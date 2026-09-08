import { NotFoundException } from '@nestjs/common';
import { CustomFieldEntity, CustomFieldType } from '@prisma/client';
import { CustomFieldsService } from './custom-fields.service';
import { inTenant, prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build(definitions: unknown[] = []) {
  const db = prismaMock() as never as Db;
  db.customFieldDefinition.findMany = jest.fn(async () => definitions);
  return { service: new CustomFieldsService(db as never), db };
}

const field = (over: Record<string, unknown> = {}) => ({
  key: 'architect',
  label: 'Architect',
  type: CustomFieldType.TEXT,
  options: [],
  required: false,
  ...over,
});

describe('list', () => {
  it('hides deactivated fields by default', async () => {
    const { service, db } = build();
    await service.list(CustomFieldEntity.LEAD);
    expect(db.customFieldDefinition.findMany.mock.calls[0][0].where).toMatchObject({
      entity: 'LEAD',
      isActive: true,
    });
  });

  it('can include them for the admin screen', async () => {
    const { service, db } = build();
    await service.list(CustomFieldEntity.LEAD, true);
    expect(db.customFieldDefinition.findMany.mock.calls[0][0].where).toEqual({
      entity: 'LEAD',
    });
  });
});

describe('create', () => {
  it('refuses a select with no options', () => {
    const { service } = build();
    expect(() =>
      service.create({
        key: 'band',
        label: 'Band',
        type: CustomFieldType.SELECT,
      } as never),
    ).toThrow(/at least one option/);
  });

  it('refuses a multi-select with no options', () => {
    const { service } = build();
    expect(() =>
      service.create({
        key: 'band',
        label: 'Band',
        type: CustomFieldType.MULTI_SELECT,
      } as never),
    ).toThrow(/at least one option/);
  });

  it('slugifies the key, because it addresses a JSON property', () => {
    const { service, db } = build();
    inTenant(() => service.create({ key: '  Budget Band! ', label: 'Budget' } as never));
    expect(db.customFieldDefinition.create.mock.calls[0][0].data.key).toBe('budget_band');
  });

  it('defaults an unspecified type to text', () => {
    const { service, db } = build();
    inTenant(() => service.create({ key: 'note', label: 'Note' } as never));
    expect(db.customFieldDefinition.create.mock.calls[0][0].data).toMatchObject({
      type: CustomFieldType.TEXT,
      options: [],
      required: false,
      sortOrder: 0,
      tenantId: 'tenant-test',
    });
  });
});

describe('update', () => {
  it('reports a missing field', async () => {
    const { service } = build();
    await expect(service.update('ghost', {} as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('writes the change once the field is known', async () => {
    const { service, db } = build();
    db.customFieldDefinition.findUnique = jest.fn(async () => ({ id: 'f1' }));
    await service.update('f1', { label: 'Renamed' } as never);
    expect(db.customFieldDefinition.update).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { label: 'Renamed' },
    });
  });
});

describe('deactivate', () => {
  it('flips the flag rather than deleting the definition', async () => {
    const { service, db } = build();
    await service.deactivate('f1');
    // Records already carry values under this key; dropping the definition
    // would leave them unlabelled.
    expect(db.customFieldDefinition.update).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { isActive: false },
    });
    expect(db.customFieldDefinition.delete).not.toHaveBeenCalled();
  });
});

describe('coerce', () => {
  const run = (definitions: unknown[], values: Record<string, unknown> | undefined, opts = {}) =>
    build(definitions).service.coerce(CustomFieldEntity.LEAD, values, opts);

  it('drops keys with no definition', async () => {
    const out = await run([field()], { architect: 'Rao', rubbish: 'x' });
    // A renamed or removed field must not leave orphan data behind.
    expect(out).toEqual({ architect: 'Rao' });
  });

  it('demands a required field', async () => {
    await expect(run([field({ required: true })], {})).rejects.toThrow(/Architect is required/);
  });

  it('treats an empty string as absent', async () => {
    await expect(run([field({ required: true })], { architect: '' })).rejects.toThrow(
      /is required/,
    );
  });

  it('lets a partial update omit a required field', async () => {
    // The edit form may render a subset; it must not be forced to resend
    // everything just to change one thing.
    await expect(run([field({ required: true })], {}, { partial: true })).resolves.toEqual({});
  });

  it('accepts no values at all', async () => {
    await expect(run([field()], undefined)).resolves.toEqual({});
  });

  it('converts a numeric string to a number', async () => {
    const out = await run([field({ type: CustomFieldType.NUMBER })], { architect: '42' });
    expect(out.architect).toBe(42);
  });

  it('refuses a number that is not one', async () => {
    await expect(
      run([field({ type: CustomFieldType.NUMBER })], { architect: 'lots' }),
    ).rejects.toThrow(/must be a number/);
  });

  it('reads "true" as true and anything else as false', async () => {
    const definitions = [field({ type: CustomFieldType.BOOLEAN })];
    await expect(run(definitions, { architect: 'true' })).resolves.toEqual({ architect: true });
    await expect(run(definitions, { architect: 'yes' })).resolves.toEqual({ architect: false });
  });

  it('normalises a date to ISO', async () => {
    const out = await run([field({ type: CustomFieldType.DATE })], { architect: '2026-03-01' });
    expect(out.architect).toBe('2026-03-01T00:00:00.000Z');
  });

  it('refuses an unparseable date', async () => {
    await expect(
      run([field({ type: CustomFieldType.DATE })], { architect: 'someday' }),
    ).rejects.toThrow(/must be a date/);
  });

  it('refuses a select value outside its options, and lists them', async () => {
    await expect(
      run([field({ type: CustomFieldType.SELECT, options: ['A', 'B'] })], { architect: 'C' }),
    ).rejects.toThrow(/must be one of: A, B/);
  });

  it('accepts a listed select value', async () => {
    const out = await run([field({ type: CustomFieldType.SELECT, options: ['A'] })], {
      architect: 'A',
    });
    expect(out.architect).toBe('A');
  });

  it('wraps a single multi-select value into an array', async () => {
    const out = await run([field({ type: CustomFieldType.MULTI_SELECT, options: ['A', 'B'] })], {
      architect: 'A',
    });
    expect(out.architect).toEqual(['A']);
  });

  it('names every invalid multi-select value', async () => {
    await expect(
      run([field({ type: CustomFieldType.MULTI_SELECT, options: ['A'] })], {
        architect: ['A', 'X', 'Y'],
      }),
    ).rejects.toThrow(/invalid values: X, Y/);
  });

  it('stringifies anything else', async () => {
    const out = await run([field()], { architect: 7 });
    expect(out.architect).toBe('7');
  });
});
