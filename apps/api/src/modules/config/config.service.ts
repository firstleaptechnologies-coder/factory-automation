import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toMm } from '@decor/shared';
import {
  CreateMaterialDto,
  GstSlabDto,
  UpdateGstSlabDto,
  CreateSizePresetDto,
  MeasurementDto,
  ThicknessDto,
  UpdateMaterialDto,
  UpdateSizePresetDto,
} from './dto/config.dto';
import { tenantId } from '../../common/tenancy/tenant-context';

/** Admin-managed masters: materials, their thickness options, and size presets. */
@Injectable()
export class ConfigurationService {
  constructor(private readonly prisma: PrismaService) {}

  // -- materials ------------------------------------------------------------

  listMaterials(includeInactive = false) {
    return this.prisma.material.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        thicknesses: {
          where: includeInactive ? {} : { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { valueMm: 'asc' }],
        },
      },
    });
  }

  async createMaterial(dto: CreateMaterialDto) {
    const { thicknesses, ...material } = dto;
    return this.prisma.material.create({
      data: {
        ...material,
        tenantId: tenantId(),
        thicknesses: thicknesses?.length
          ? { create: thicknesses.map((t) => ({ ...toThicknessRow(t), tenantId: tenantId() })) }
          : undefined,
      },
      include: { thicknesses: true },
    });
  }

  async updateMaterial(id: string, dto: UpdateMaterialDto) {
    await this.getMaterial(id);
    return this.prisma.material.update({
      where: { id },
      data: dto,
      include: { thicknesses: true },
    });
  }

  async addThickness(materialId: string, dto: ThicknessDto) {
    await this.getMaterial(materialId);
    return this.prisma.materialThickness.create({
      data: { materialId, tenantId: tenantId(), ...toThicknessRow(dto) },
    });
  }

  async removeThickness(id: string) {
    // Deactivated rather than deleted: existing orders point at it, and their
    // history must keep resolving.
    return this.prisma.materialThickness.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async getMaterial(id: string) {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) throw new NotFoundException(`Material ${id} not found`);
    return material;
  }

  // -- size presets ---------------------------------------------------------

  listSizePresets(includeInactive = false) {
    return this.prisma.sizePreset.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  createSizePreset(dto: CreateSizePresetDto) {
    return this.prisma.sizePreset.create({
      data: {
        tenantId: tenantId(),
        code: dto.code,
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
        lengthMm: measure(dto.length),
        widthMm: measure(dto.width),
        thicknessMm: dto.thickness ? measure(dto.thickness) : null,
      },
    });
  }

  async updateSizePreset(id: string, dto: UpdateSizePresetDto) {
    const preset = await this.prisma.sizePreset.findUnique({ where: { id } });
    if (!preset) throw new NotFoundException(`Size preset ${id} not found`);

    return this.prisma.sizePreset.update({
      where: { id },
      data: {
        code: dto.code,
        name: dto.name,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
        lengthMm: dto.length ? measure(dto.length) : undefined,
        widthMm: dto.width ? measure(dto.width) : undefined,
        thicknessMm: dto.thickness ? measure(dto.thickness) : undefined,
      },
    });
  }

  // -- GST slabs ------------------------------------------------------------

  listGstSlabs(includeInactive = false) {
    return this.prisma.gstSlab.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { ratePct: 'asc' }],
    });
  }

  async createGstSlab(dto: GstSlabDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await this.clearDefaultSlab(tx);
      return tx.gstSlab.create({
        data: {
          tenantId: tenantId(),
          name: dto.name,
          ratePct: dto.ratePct,
          isDefault: dto.isDefault ?? false,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    });
  }

  async updateGstSlab(id: string, dto: UpdateGstSlabDto) {
    const slab = await this.prisma.gstSlab.findFirst({ where: { id } });
    if (!slab) throw new NotFoundException(`GST slab ${id} not found`);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await this.clearDefaultSlab(tx, id);
      return tx.gstSlab.update({ where: { id }, data: dto });
    });
  }

  /**
   * Exactly one default. Two would make which rate an order picked up depend on
   * row order, which is the kind of thing nobody notices until an invoice is
   * wrong.
   */
  private async clearDefaultSlab(tx: Prisma.TransactionClient, exceptId?: string) {
    await tx.gstSlab.updateMany({
      where: { isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isDefault: false },
    });
  }

  // -- app settings ---------------------------------------------------------

  async getSettings(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.appSetting.findMany();
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  async setSetting(key: string, value: unknown) {
    return this.prisma.appSetting.upsert({
      where: { tenantId_key: { tenantId: tenantId(), key } },
      update: { value: value as never },
      create: { tenantId: tenantId(), key, value: value as never },
    });
  }
}

/** Every dimension crosses into the database through this one conversion. */
function measure(input: MeasurementDto): number {
  return toMm(input.value, input.unit);
}

function toThicknessRow(dto: ThicknessDto) {
  return {
    valueMm: measure(dto.value),
    label: dto.label,
    sortOrder: dto.sortOrder ?? 0,
  };
}
