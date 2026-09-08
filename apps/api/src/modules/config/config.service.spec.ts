import { NotFoundException } from '@nestjs/common';
import { ConfigurationService } from './config.service';
import { inTenant, prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build() {
  const db = prismaMock() as never as Db;
  return { service: new ConfigurationService(db as never), db };
}

const mm = (value: number) => ({ value, unit: 'MM' });

describe('materials', () => {
  it('hides deactivated materials and their thicknesses by default', async () => {
    const { service, db } = build();
    await service.listMaterials();
    const call = db.material.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ isActive: true });
    expect(call.include.thicknesses.where).toEqual({ isActive: true });
  });

  it('shows everything for the admin screen', async () => {
    const { service, db } = build();
    await service.listMaterials(true);
    const call = db.material.findMany.mock.calls[0][0];
    expect(call.where).toEqual({});
    expect(call.include.thicknesses.where).toEqual({});
  });

  it('creates the thickness options alongside the material', async () => {
    const { service, db } = build();
    await inTenant(() =>
      service.createMaterial({
        code: 'MDF',
        name: 'MDF',
        thicknesses: [{ value: mm(18), label: '18mm' }],
      } as never),
    );
    const data = db.material.create.mock.calls[0][0].data;
    expect(data.thicknesses.create).toEqual([
      { valueMm: 18, label: '18mm', sortOrder: 0, tenantId: 'tenant-test' },
    ]);
  });

  it('omits the nested create entirely when no thicknesses were given', async () => {
    const { service, db } = build();
    await inTenant(() => service.createMaterial({ code: 'MDF', name: 'MDF' } as never));
    expect(db.material.create.mock.calls[0][0].data.thicknesses).toBeUndefined();
  });

  it('converts a thickness typed in another unit to millimetres', async () => {
    const { service, db } = build();
    db.material.findUnique = jest.fn(async () => ({ id: 'm1' }));
    await inTenant(() =>
      service.addThickness('m1', { value: { value: 1.8, unit: 'CM' } } as never),
    );
    expect(db.materialThickness.create.mock.calls[0][0].data.valueMm).toBe(18);
  });

  it('refuses to hang a thickness off an unknown material', async () => {
    const { service } = build();
    await expect(
      inTenant(() => service.addThickness('ghost', { value: mm(18) } as never)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to update an unknown material', async () => {
    const { service, db } = build();
    await expect(service.updateMaterial('ghost', {} as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.material.update).not.toHaveBeenCalled();
  });

  it('deactivates a thickness rather than deleting it', async () => {
    const { service, db } = build();
    await service.removeThickness('t1');
    // Existing orders point at it and their history must keep resolving.
    expect(db.materialThickness.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { isActive: false },
    });
    expect(db.materialThickness.delete).not.toHaveBeenCalled();
  });
});

describe('size presets', () => {
  it('stores every dimension in millimetres', async () => {
    const { service, db } = build();
    inTenant(() =>
      service.createSizePreset({
        code: 'SHEET',
        name: '8x4',
        length: { value: 8, unit: 'FT' },
        width: { value: 4, unit: 'FT' },
        thickness: mm(18),
      } as never),
    );
    const data = db.sizePreset.create.mock.calls[0][0].data;
    expect(data.lengthMm).toBeCloseTo(2438.4, 1);
    expect(data.widthMm).toBeCloseTo(1219.2, 1);
    expect(data.thicknessMm).toBe(18);
  });

  it('leaves thickness null when it was not given', () => {
    const { service, db } = build();
    inTenant(() =>
      service.createSizePreset({
        code: 'S',
        name: 'S',
        length: mm(100),
        width: mm(100),
      } as never),
    );
    expect(db.sizePreset.create.mock.calls[0][0].data.thicknessMm).toBeNull();
  });

  it('reports a missing preset', async () => {
    const { service } = build();
    await expect(service.updateSizePreset('ghost', {} as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('leaves a dimension untouched when the edit omits it', async () => {
    const { service, db } = build();
    db.sizePreset.findUnique = jest.fn(async () => ({ id: 'sp1' }));
    await service.updateSizePreset('sp1', { name: 'Renamed' } as never);
    const data = db.sizePreset.update.mock.calls[0][0].data;
    expect(data.lengthMm).toBeUndefined();
    expect(data.widthMm).toBeUndefined();
    expect(data.thicknessMm).toBeUndefined();
  });

  it('converts a changed dimension', async () => {
    const { service, db } = build();
    db.sizePreset.findUnique = jest.fn(async () => ({ id: 'sp1' }));
    await service.updateSizePreset('sp1', { length: { value: 1, unit: 'M' } } as never);
    expect(db.sizePreset.update.mock.calls[0][0].data.lengthMm).toBe(1000);
  });
});

describe('GST slabs', () => {
  it('clears the previous default when a new slab claims it', async () => {
    const { service, db } = build();
    await inTenant(() => service.createGstSlab({ name: '18%', ratePct: 18, isDefault: true } as never));
    // Two defaults would make the rate an order picks up depend on row order.
    expect(db.gstSlab.updateMany).toHaveBeenCalledWith({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  });

  it('leaves the existing default alone for an ordinary slab', async () => {
    const { service, db } = build();
    await inTenant(() => service.createGstSlab({ name: '5%', ratePct: 5 } as never));
    expect(db.gstSlab.updateMany).not.toHaveBeenCalled();
    expect(db.gstSlab.create.mock.calls[0][0].data.isDefault).toBe(false);
  });

  it('excludes itself when an existing slab is promoted', async () => {
    const { service, db } = build();
    db.gstSlab.findFirst = jest.fn(async () => ({ id: 'g1' }));
    await service.updateGstSlab('g1', { isDefault: true } as never);
    expect(db.gstSlab.updateMany.mock.calls[0][0].where).toEqual({
      isDefault: true,
      id: { not: 'g1' },
    });
  });

  it('reports a missing slab', async () => {
    const { service } = build();
    await expect(service.updateGstSlab('ghost', {} as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('hides deactivated slabs by default', async () => {
    const { service, db } = build();
    await service.listGstSlabs();
    expect(db.gstSlab.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
  });
});

describe('app settings', () => {
  it('flattens the rows into one object keyed by setting', async () => {
    const { service, db } = build();
    db.appSetting.findMany = jest.fn(async () => [
      { key: 'accent', value: '#2563EB' },
      { key: 'disbursementLabel', value: 'ISC' },
    ]);
    await expect(service.getSettings()).resolves.toEqual({
      accent: '#2563EB',
      disbursementLabel: 'ISC',
    });
  });

  it('returns an empty object when nothing is configured', async () => {
    const { service } = build();
    await expect(service.getSettings()).resolves.toEqual({});
  });

  it('upserts on the tenant-and-key pair, so one shop cannot overwrite another', async () => {
    const { service, db } = build();
    await inTenant(() => service.setSetting('accent', '#FF0000'));
    expect(db.appSetting.upsert.mock.calls[0][0]).toMatchObject({
      where: { tenantId_key: { tenantId: 'tenant-test', key: 'accent' } },
      update: { value: '#FF0000' },
      create: { tenantId: 'tenant-test', key: 'accent', value: '#FF0000' },
    });
  });
});
