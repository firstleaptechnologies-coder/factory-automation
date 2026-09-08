import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StockService } from './stock.service';
import { inTenant, prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

const MATERIAL = {
  id: 'm1',
  code: 'PLY',
  name: 'Plywood',
  color: '#C4A484',
  stockUnit: 'sheet',
  reorderLevel: 4,
  thicknesses: [{ id: 't1', valueMm: 18, label: null, isActive: true }],
};

function build(moves: unknown[] = []) {
  const db = prismaMock() as never as Db;
  db.material.findMany = jest.fn(async () => [MATERIAL]);
  db.material.findFirst = jest.fn(async () => MATERIAL);
  db.stockMove.findMany = jest.fn(async () => moves);
  db.stockMove.create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 's1',
    ...data,
  }));
  return { service: new StockService(db as never), db };
}

const move = (kind: string, quantity: number, over: Record<string, unknown> = {}) => ({
  materialId: 'm1',
  thicknessId: 't1',
  kind,
  quantity,
  rate: 900,
  material: MATERIAL,
  ...over,
});

describe('what is on the rack', () => {
  it('is summed from the moves, with what it is worth', async () => {
    const { service } = build([move('RECEIPT', 10), move('CONSUMPTION', -4)]);
    const { rows } = await service.levels({});
    expect(rows[0]).toMatchObject({ quantity: 6, value: 5400 });
  });

  it('breaks it down by thickness, because 18mm is not 6mm', async () => {
    const { service } = build([
      move('RECEIPT', 10),
      move('RECEIPT', 5, { thicknessId: 't9' }),
    ]);
    const { rows } = await service.levels({});
    // A single figure would say the two were interchangeable.
    expect(rows[0].byThickness).toEqual([
      { thickness: { id: 't1', valueMm: 18, label: null }, quantity: 10 },
    ]);
  });

  it('says which materials need ordering', async () => {
    const { service } = build([move('RECEIPT', 10), move('CONSUMPTION', -7)]);
    const { rows, totals } = await service.levels({});
    // The level is four; three is at or below it.
    expect(rows[0].low).toBe(true);
    expect(totals.low).toBe(1);
  });

  it('can be asked for only what is low', async () => {
    const { service } = build([move('RECEIPT', 20)]);
    const { rows } = await service.levels({ lowOnly: 'true' });
    expect(rows).toEqual([]);
  });
});

describe('recording a move', () => {
  it('signs it once, so nothing downstream has to remember which way', async () => {
    const { service, db } = build([move('RECEIPT', 10)]);
    await inTenant(() =>
      service.record({ materialId: 'm1', kind: 'CONSUMPTION' as never, quantity: 4 }),
    );
    expect(db.stockMove.create.mock.calls[0][0].data.quantity).toBe(-4);
  });

  it('puts an offcut back on the rack', async () => {
    const { service, db } = build([move('RECEIPT', 10)]);
    await inTenant(() =>
      service.record({ materialId: 'm1', kind: 'OFFCUT' as never, quantity: 1.5 }),
    );
    expect(db.stockMove.create.mock.calls[0][0].data.quantity).toBe(1.5);
  });

  it('refuses a delivery, because stock arrives against a purchase', async () => {
    const { service } = build();
    // Everything on the rack has a bill behind it. That is the whole line
    // between a purchase and an expense.
    await expect(
      inTenant(() =>
        service.record({ materialId: 'm1', kind: 'RECEIPT' as never, quantity: 4 }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('insists on a reason for waste', async () => {
    const { service } = build([move('RECEIPT', 10)]);
    // A sheet that vanished with no reason beside it is the thing this module
    // exists to stop.
    await expect(
      inTenant(() =>
        service.record({ materialId: 'm1', kind: 'WASTE' as never, quantity: 1 }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('insists on a reason for a count that disagreed', async () => {
    const { service } = build([move('RECEIPT', 10)]);
    await expect(
      inTenant(() =>
        service.record({ materialId: 'm1', kind: 'ADJUSTMENT' as never, quantity: 2 }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('takes a reason and records it', async () => {
    const { service, db } = build([move('RECEIPT', 10)]);
    await inTenant(() =>
      service.record({
        materialId: 'm1',
        kind: 'WASTE' as never,
        quantity: 1,
        reason: 'Board split on the saw',
      }),
    );
    expect(db.stockMove.create.mock.calls[0][0].data.reason).toBe('Board split on the saw');
  });

  it('will not issue more than is on the rack', async () => {
    const { service } = build([move('RECEIPT', 3)]);
    await expect(
      inTenant(() =>
        service.record({ materialId: 'm1', kind: 'CONSUMPTION' as never, quantity: 4 }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a material or an order that is not there', async () => {
    const { service, db } = build();
    db.material.findFirst = jest.fn(async () => null);
    await expect(
      inTenant(() =>
        service.record({ materialId: 'ghost', kind: 'OFFCUT' as never, quantity: 1 }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('what became of what left the rack', () => {
  it('reports waste per material, worst first', async () => {
    const { service, db } = build();
    db.stockMove.findMany = jest.fn(async () => [
      move('CONSUMPTION', -10),
      move('OFFCUT', 2),
      move('WASTE', -1.5),
      { ...move('CONSUMPTION', -4), materialId: 'm2', material: { ...MATERIAL, id: 'm2', name: 'Acrylic' } },
      { ...move('WASTE', -2), materialId: 'm2', material: { ...MATERIAL, id: 'm2', name: 'Acrylic' } },
    ]);
    const report = await service.waste({ from: '2026-09-01', to: '2026-09-30' });

    // A shop wasting half its acrylic and a seventh of its ply has one problem,
    // not a general one.
    expect(report.rows[0].material.name).toBe('Acrylic');
    expect(report.rows[0]).toMatchObject({ consumed: 4, wasted: 2, wastePct: 50 });
    expect(report.rows[1]).toMatchObject({ consumed: 10, wasted: 1.5, wastePct: 15 });
  });

  it('totals it across everything as well', async () => {
    const { service, db } = build();
    db.stockMove.findMany = jest.fn(async () => [
      move('CONSUMPTION', -10),
      move('WASTE', -2),
    ]);
    const report = await service.waste({ from: '2026-09-01', to: '2026-09-30' });
    expect(report.totals).toMatchObject({ consumed: 10, wasted: 2, wastePct: 20 });
  });
});
