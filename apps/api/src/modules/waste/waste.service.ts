import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WasteDisposition, WasteType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { round } from '../../common/utils/geometry';
import {
  CreateWasteRecordDto,
  UpdateDispositionDto,
  WasteQueryDto,
} from './dto/waste.dto';

@Injectable()
export class WasteService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: WasteQueryDto) {
    const where = this.buildWhere(query);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.wasteRecord.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { recordedAt: 'desc' },
        include: {
          material: { select: { id: true, code: true, name: true } },
          job: { select: { id: true, code: true } },
          reason: { select: { id: true, code: true, name: true } },
          recoveredStockUnit: { select: { id: true, code: true } },
          recordedBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.wasteRecord.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  create(dto: CreateWasteRecordDto, userId?: string) {
    return this.prisma.wasteRecord.create({
      data: { ...dto, recordedById: userId },
    });
  }

  async setDisposition(id: string, dto: UpdateDispositionDto) {
    const record = await this.prisma.wasteRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`Waste record ${id} not found`);

    return this.prisma.wasteRecord.update({
      where: { id },
      data: {
        disposition: dto.disposition,
        remarks: dto.remarks ?? record.remarks,
      },
    });
  }

  /**
   * The number the owner actually wants on a Monday morning: how much material
   * was bought, how much left as product, and what the gap cost.
   */
  async analytics(query: WasteQueryDto) {
    const where = this.buildWhere(query);

    const [byType, byMaterial, byDisposition, totals] = await Promise.all([
      this.prisma.wasteRecord.groupBy({
        by: ['type'],
        where,
        orderBy: { type: 'asc' },
        _sum: { areaSqm: true, weightKg: true, quantity: true, costImpact: true },
        _count: { _all: true },
      }),
      this.prisma.wasteRecord.groupBy({
        by: ['materialId'],
        where,
        orderBy: { materialId: 'asc' },
        _sum: { areaSqm: true, costImpact: true },
        _count: { _all: true },
      }),
      this.prisma.wasteRecord.groupBy({
        by: ['disposition'],
        where,
        orderBy: { disposition: 'asc' },
        _sum: { areaSqm: true, costImpact: true },
        _count: { _all: true },
      }),
      this.prisma.wasteRecord.aggregate({
        where,
        _sum: { areaSqm: true, costImpact: true },
        _count: { _all: true },
      }),
    ]);

    const materials = await this.prisma.material.findMany({
      where: { id: { in: byMaterial.map((m) => m.materialId) } },
      select: { id: true, code: true, name: true, category: { select: { name: true } } },
    });
    const materialById = new Map(materials.map((m) => [m.id, m]));

    const reusableArea = byDisposition
      .filter((d) => d.disposition === WasteDisposition.REUSE)
      .reduce((sum, d) => sum + Number(d._sum.areaSqm ?? 0), 0);
    const totalArea = Number(totals._sum.areaSqm ?? 0);

    return {
      totals: {
        records: totals._count._all,
        areaSqm: round(totalArea, 4),
        costImpact: round(Number(totals._sum.costImpact ?? 0), 2),
        /** Share of scrapped area that was saved as a usable offcut. */
        recoveryRatePct: totalArea > 0 ? round((reusableArea / totalArea) * 100, 2) : 0,
      },
      byType: byType.map((row) => ({
        type: row.type,
        records: row._count._all,
        areaSqm: round(Number(row._sum.areaSqm ?? 0), 4),
        weightKg: round(Number(row._sum.weightKg ?? 0), 3),
        quantity: round(Number(row._sum.quantity ?? 0), 3),
        costImpact: round(Number(row._sum.costImpact ?? 0), 2),
      })),
      byMaterial: byMaterial
        .map((row) => ({
          materialId: row.materialId,
          code: materialById.get(row.materialId)?.code,
          name: materialById.get(row.materialId)?.name,
          category: materialById.get(row.materialId)?.category.name,
          records: row._count._all,
          areaSqm: round(Number(row._sum.areaSqm ?? 0), 4),
          costImpact: round(Number(row._sum.costImpact ?? 0), 2),
        }))
        .sort((a, b) => b.costImpact - a.costImpact),
      byDisposition: byDisposition.map((row) => ({
        disposition: row.disposition,
        records: row._count._all,
        areaSqm: round(Number(row._sum.areaSqm ?? 0), 4),
        costImpact: round(Number(row._sum.costImpact ?? 0), 2),
      })),
    };
  }

  /** Offcuts sitting in the store that nobody has used yet — money on a rack. */
  async offcutInventory() {
    const rows = await this.prisma.stockUnit.groupBy({
      by: ['materialId'],
      where: { kind: 'OFFCUT', status: 'AVAILABLE' },
      orderBy: { materialId: 'asc' },
      _count: { _all: true },
      _sum: { areaSqm: true, purchaseCost: true },
    });

    const materials = await this.prisma.material.findMany({
      where: { id: { in: rows.map((r) => r.materialId) } },
      select: { id: true, code: true, name: true },
    });
    const byId = new Map(materials.map((m) => [m.id, m]));

    return rows
      .map((row) => ({
        materialId: row.materialId,
        code: byId.get(row.materialId)?.code,
        name: byId.get(row.materialId)?.name,
        pieces: row._count._all,
        areaSqm: round(Number(row._sum.areaSqm ?? 0), 4),
        value: round(Number(row._sum.purchaseCost ?? 0), 2),
      }))
      .sort((a, b) => b.value - a.value);
  }

  private buildWhere(query: WasteQueryDto): Prisma.WasteRecordWhereInput {
    return {
      ...(query.materialId ? { materialId: query.materialId } : {}),
      ...(query.type ? { type: query.type as WasteType } : {}),
      ...(query.disposition ? { disposition: query.disposition } : {}),
      ...(query.from || query.to
        ? {
            recordedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
  }
}
