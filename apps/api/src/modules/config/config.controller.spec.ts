import { ConfigurationController } from './config.controller';

const config = {
  listMaterials: jest.fn(async (..._a: unknown[]) => 'materials'),
  listSizePresets: jest.fn(async (..._a: unknown[]) => 'sizes'),
  listGstSlabs: jest.fn(async (..._a: unknown[]) => 'slabs'),
  getSettings: jest.fn(async (..._a: unknown[]) => 'settings'),
  createMaterial: jest.fn(async (..._a: unknown[]) => 'created'),
  updateMaterial: jest.fn(async (..._a: unknown[]) => 'updated'),
  addThickness: jest.fn(async (..._a: unknown[]) => 'added'),
  removeThickness: jest.fn(async (..._a: unknown[]) => 'removed'),
  createSizePreset: jest.fn(async (..._a: unknown[]) => 'created'),
  updateSizePreset: jest.fn(async (..._a: unknown[]) => 'updated'),
  createGstSlab: jest.fn(async (..._a: unknown[]) => 'created'),
  updateGstSlab: jest.fn(async (..._a: unknown[]) => 'updated'),
  setSetting: jest.fn(async (..._a: unknown[]) => 'set'),
};

const controller = new ConfigurationController(config as never);

beforeEach(() => jest.clearAllMocks());

describe('what the punch screen may see', () => {
  it.each([
    ['listMaterials', config.listMaterials],
    ['listSizePresets', config.listSizePresets],
    ['listGstSlabs', config.listGstSlabs],
  ] as const)('hides the deactivated rows from %s by default', async (handler, spy) => {
    await (controller as unknown as Record<string, (q?: string) => Promise<unknown>>)[handler]();
    // The punch form must not offer a material the shop has retired.
    expect(spy).toHaveBeenCalledWith(false);
  });

  it.each([
    ['listMaterials', config.listMaterials],
    ['listSizePresets', config.listSizePresets],
    ['listGstSlabs', config.listGstSlabs],
  ] as const)('includes them for %s when the admin screen asks', async (handler, spy) => {
    await (controller as unknown as Record<string, (q?: string) => Promise<unknown>>)[handler](
      'true',
    );
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('treats anything other than "true" as no', async () => {
    await controller.listMaterials('yes please');
    expect(config.listMaterials).toHaveBeenCalledWith(false);
  });
});

it('reads the shop’s settings', async () => {
  await controller.getSettings();
  expect(config.getSettings).toHaveBeenCalled();
});

describe('changing the configuration', () => {
  it('adds a material', async () => {
    await controller.createMaterial({ code: 'PLY', name: 'Plywood' } as never);
    expect(config.createMaterial).toHaveBeenCalledWith({ code: 'PLY', name: 'Plywood' });
  });

  it('adds a thickness to the material it belongs to', async () => {
    await controller.addThickness('m1', { value: { value: 18, unit: 'MM' } } as never);
    expect(config.addThickness).toHaveBeenCalledWith('m1', { value: { value: 18, unit: 'MM' } });
  });

  it('removes a thickness by its own id', async () => {
    await controller.removeThickness('t1');
    expect(config.removeThickness).toHaveBeenCalledWith('t1');
  });

  it('adds and edits a size preset', async () => {
    await controller.createSizePreset({ code: 'SHEET' } as never);
    await controller.updateSizePreset('sp1', { name: 'Sheet' } as never);
    expect(config.createSizePreset).toHaveBeenCalledWith({ code: 'SHEET' });
    expect(config.updateSizePreset).toHaveBeenCalledWith('sp1', { name: 'Sheet' });
  });

  it('adds and edits a GST slab', async () => {
    await controller.createGstSlab({ ratePct: 18 } as never);
    await controller.updateGstSlab('g1', { isDefault: true } as never);
    expect(config.createGstSlab).toHaveBeenCalledWith({ ratePct: 18 });
    expect(config.updateGstSlab).toHaveBeenCalledWith('g1', { isDefault: true });
  });

  it('deactivates a material rather than needing it deleted', async () => {
    await controller.updateMaterial('m1', { isActive: false } as never);
    expect(config.updateMaterial).toHaveBeenCalledWith('m1', { isActive: false });
  });

  it('writes a single setting by key, taking the value out of the body', async () => {
    await controller.setSetting('disbursementLabel', 'ISC');
    expect(config.setSetting).toHaveBeenCalledWith('disbursementLabel', 'ISC');
  });
});
