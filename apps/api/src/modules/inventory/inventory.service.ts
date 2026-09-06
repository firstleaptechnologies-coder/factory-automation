import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MovementType,
  Prisma,
  StockUnitKind,
  StockUnitStatus,
  WasteDisposition,
  WasteType,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';
import { areaSqm, isReusableOffcut, round } from '../../common/utils/geometry';
import { paginate } from '../../common/dto/pagination.dto';
import {
  AdjustStockDto,
  CloseStockUnitDto,
  CreateLocationDto,
  IssueToJobDto,
  ReceiveStockDto,
  StockQueryDto,
  TransferStockDto,
} from './dto/inventory.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodeGeneratorService,
  ) {}

  // -- locations ------------------------------------------------------------

  listLocations() {
    return this.prisma.stockLocation.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  createLocation(dto: CreateLocationDto) {
    return this.prisma.stockLocation.create({ data: dto });
  }

  // -- stock query ----------------------------------------------------------

  async list(query: StockQueryDto) {
    const where: Prisma.StockUnitWhereInput = {
      ...(query.materialId ? { materialId: query.materialId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.offcutsOnly ? { kind: StockUnitKind.OFFCUT } : {}),
      status: query.status ?? StockUnitStatus.AVAILABLE,
      ...(query.search ? { code: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockUnit.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: [{ kind: 'asc' }, { receivedAt: 'asc' }],
        include: {
          material: { select: { id: true, code: true, name: true, uom: true } },
          location: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.stockUnit.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  async findOne(id: string) {
    const unit = await this.prisma.stockUnit.findUnique({
      where: { id },
      include: {
        material: true,
        location: true,
        parent: { select: { id: true, code: true } },
        children: { select: { id: true, code: true, areaSqm: true, status: true } },
        movements: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!unit) throw new NotFoundException(`Stock unit ${id} not found`);
    return unit;
  }

  /** Stock on hand per material, split full sheets vs. recoverable offcuts. */
  async summary() {
    const rows = await this.prisma.stockUnit.groupBy({
      by: ['materialId', 'kind'],
      where: { status: StockUnitStatus.AVAILABLE },
      orderBy: { materialId: 'asc' },
      _count: { _all: true },
      _sum: { areaSqm: true, quantity: true },
    });

    const materials = await this.prisma.material.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.materialId))] } },
      include: { category: { select: { code: true, name: true } } },
    });
    const byId = new Map(materials.map((m) => [m.id, m]));

    return rows.map((row) => {
      const material = byId.get(row.materialId);
      return {
        materialId: row.materialId,
        materialCode: material?.code,
        materialName: material?.name,
        category: material?.category.name,
        kind: row.kind,
        pieces: row._count._all,
        areaSqm: Number(row._sum.areaSqm ?? 0),
        quantity: Number(row._sum.quantity ?? 0),
        belowReorderLevel:
          material != null &&
          Number(material.reorderLevel) > 0 &&
          Number(row._sum.areaSqm ?? row._sum.quantity ?? 0) < Number(material.reorderLevel),
      };
    });
  }

  // -- inward ---------------------------------------------------------------

  /**
   * Receiving creates one StockUnit per physical piece. Bulk quantities would be
   * cheaper to store, but then an offcut can never be traced to the sheet — and
   * that trace is the whole point of the waste module.
   */
  async receive(dto: ReceiveStockDto, userId?: string) {
    const material = await this.prisma.material.findUnique({
      where: { id: dto.materialId },
    });
    if (!material) throw new NotFoundException('Material not found');

    const lengthMm = dto.lengthMm ?? Number(material.lengthMm ?? 0);
    const widthMm = dto.widthMm ?? Number(material.widthMm ?? 0);
    const isSheet = material.isSheetGood && lengthMm > 0 && widthMm > 0;

    if (!isSheet && !dto.quantity) {
      throw new BadRequestException(
        'Non-sheet material needs a quantity per piece',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const units = [];
      for (let i = 0; i < dto.pieces; i += 1) {
        const code = await this.codes.next('stockUnit', tx);
        const unit = await tx.stockUnit.create({
          data: {
            code,
            materialId: dto.materialId,
            kind: isSheet ? StockUnitKind.FULL_SHEET : StockUnitKind.BULK,
            status: StockUnitStatus.AVAILABLE,
            lengthMm: isSheet ? lengthMm : null,
            widthMm: isSheet ? widthMm : null,
            thicknessMm: dto.thicknessMm ?? material.thicknessMm,
            areaSqm: isSheet ? areaSqm(lengthMm, widthMm) : null,
            quantity: isSheet ? null : dto.quantity,
            locationId: dto.locationId,
            batchNo: dto.batchNo,
            purchaseCost: dto.unitCost ?? material.standardCost,
          },
        });

        await tx.stockMovement.create({
          data: {
            stockUnitId: unit.id,
            type: MovementType.RECEIPT,
            areaSqm: unit.areaSqm,
            quantity: unit.quantity,
            toLocationId: dto.locationId,
            userId,
            note: dto.note,
          },
        });
        units.push(unit);
      }
      return units;
    });

    return { received: created.length, units: created };
  }

  // -- outward --------------------------------------------------------------

  async issueToJob(dto: IssueToJobDto, userId?: string) {
    const job = await this.prisma.job.findUnique({ where: { id: dto.jobId } });
    if (!job) throw new NotFoundException('Job not found');

    const units = await this.prisma.stockUnit.findMany({
      where: { id: { in: dto.stockUnitIds } },
    });
    if (units.length !== dto.stockUnitIds.length) {
      throw new BadRequestException('One or more stock units not found');
    }

    const unavailable = units.filter(
      (u) => u.status !== StockUnitStatus.AVAILABLE && u.status !== StockUnitStatus.RESERVED,
    );
    if (unavailable.length) {
      throw new BadRequestException(
        `Not issuable: ${unavailable.map((u) => u.code).join(', ')}`,
      );
    }

    const wrongMaterial = units.filter((u) => u.materialId !== job.materialId);
    if (wrongMaterial.length) {
      throw new BadRequestException(
        `Material mismatch with job: ${wrongMaterial.map((u) => u.code).join(', ')}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      for (const unit of units) {
        await tx.stockUnit.update({
          where: { id: unit.id },
          data: { status: StockUnitStatus.IN_USE },
        });
        await tx.jobMaterialIssue.create({
          data: {
            jobId: dto.jobId,
            stockUnitId: unit.id,
            areaSqm: unit.areaSqm,
            quantity: unit.quantity,
            cost: unit.purchaseCost,
          },
        });
        await tx.stockMovement.create({
          data: {
            stockUnitId: unit.id,
            type: MovementType.ISSUE,
            areaSqm: unit.areaSqm,
            quantity: unit.quantity,
            fromLocationId: unit.locationId,
            jobId: dto.jobId,
            userId,
            note: dto.note,
          },
        });
      }
      return { issued: units.length };
    });
  }

  /**
   * Close a sheet once the job is off it: the pieces the operator saved come
   * back as offcut StockUnits, and whatever is left over is booked as waste
   * against the job. Both halves in one transaction so the sheet's area always
   * balances: parts + offcuts + waste = sheet.
   */
  async closeStockUnit(dto: CloseStockUnitDto, userId?: string) {
    const unit = await this.prisma.stockUnit.findUnique({
      where: { id: dto.stockUnitId },
      include: { material: true },
    });
    if (!unit) throw new NotFoundException('Stock unit not found');
    if (unit.status === StockUnitStatus.CONSUMED) {
      throw new BadRequestException(`${unit.code} is already closed`);
    }

    const sheetArea = Number(unit.areaSqm ?? 0);
    const offcuts = dto.offcuts ?? [];
    const offcutArea = round(
      offcuts.reduce((sum, o) => sum + areaSqm(o.lengthMm, o.widthMm), 0),
      4,
    );

    if (sheetArea > 0 && offcutArea > sheetArea) {
      throw new BadRequestException(
        `Offcut area (${offcutArea} m²) exceeds the sheet (${sheetArea} m²)`,
      );
    }

    const unitCostPerSqm =
      sheetArea > 0 ? Number(unit.purchaseCost ?? 0) / sheetArea : 0;

    return this.prisma.$transaction(async (tx) => {
      const recovered = [];

      for (const offcut of offcuts) {
        if (!isReusableOffcut(offcut.lengthMm, offcut.widthMm)) {
          // Too small to hold a part — book it as waste rather than pretend it
          // is stock.
          await tx.wasteRecord.create({
            data: {
              materialId: unit.materialId,
              jobId: dto.jobId,
              type: WasteType.TRIM,
              disposition: WasteDisposition.RECYCLE,
              areaSqm: areaSqm(offcut.lengthMm, offcut.widthMm),
              lengthMm: offcut.lengthMm,
              widthMm: offcut.widthMm,
              isReusable: false,
              costImpact: round(
                areaSqm(offcut.lengthMm, offcut.widthMm) * unitCostPerSqm,
                4,
              ),
              recordedById: userId,
              remarks: 'Below reuse threshold',
            },
          });
          continue;
        }

        const code = await this.codes.next('stockUnit', tx);
        const child = await tx.stockUnit.create({
          data: {
            code,
            materialId: unit.materialId,
            kind: StockUnitKind.OFFCUT,
            status: StockUnitStatus.AVAILABLE,
            lengthMm: offcut.lengthMm,
            widthMm: offcut.widthMm,
            thicknessMm: unit.thicknessMm,
            areaSqm: areaSqm(offcut.lengthMm, offcut.widthMm),
            locationId: offcut.locationId ?? unit.locationId,
            parentId: unit.id,
            batchNo: unit.batchNo,
            purchaseCost: round(
              areaSqm(offcut.lengthMm, offcut.widthMm) * unitCostPerSqm,
              4,
            ),
          },
        });

        await tx.stockMovement.create({
          data: {
            stockUnitId: child.id,
            type: MovementType.OFFCUT_RECOVERY,
            areaSqm: child.areaSqm,
            toLocationId: child.locationId,
            jobId: dto.jobId,
            userId,
            note: `Recovered from ${unit.code}`,
          },
        });

        await tx.wasteRecord.create({
          data: {
            materialId: unit.materialId,
            jobId: dto.jobId,
            type: WasteType.OFFCUT,
            disposition: WasteDisposition.REUSE,
            areaSqm: child.areaSqm,
            lengthMm: offcut.lengthMm,
            widthMm: offcut.widthMm,
            isReusable: true,
            recoveredStockUnitId: child.id,
            costImpact: 0, // value retained, not lost
            recordedById: userId,
          },
        });

        recovered.push(child);
      }

      await tx.stockUnit.update({
        where: { id: unit.id },
        data: { status: StockUnitStatus.CONSUMED },
      });

      await tx.stockMovement.create({
        data: {
          stockUnitId: unit.id,
          type: MovementType.ISSUE,
          areaSqm: unit.areaSqm,
          quantity: unit.quantity,
          fromLocationId: unit.locationId,
          jobId: dto.jobId,
          userId,
          note: dto.remarks ?? 'Sheet closed out',
        },
      });

      return {
        stockUnit: unit.code,
        sheetAreaSqm: sheetArea,
        recoveredOffcuts: recovered.length,
        recoveredAreaSqm: round(
          recovered.reduce((s, c) => s + Number(c.areaSqm ?? 0), 0),
          4,
        ),
      };
    });
  }

  async transfer(dto: TransferStockDto, userId?: string) {
    const unit = await this.prisma.stockUnit.findUnique({
      where: { id: dto.stockUnitId },
    });
    if (!unit) throw new NotFoundException('Stock unit not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.stockUnit.update({
        where: { id: unit.id },
        data: { locationId: dto.toLocationId },
      });
      await tx.stockMovement.create({
        data: {
          stockUnitId: unit.id,
          type: MovementType.TRANSFER,
          areaSqm: unit.areaSqm,
          quantity: unit.quantity,
          fromLocationId: unit.locationId,
          toLocationId: dto.toLocationId,
          userId,
          note: dto.note,
        },
      });
      return updated;
    });
  }

  async adjust(dto: AdjustStockDto, userId?: string) {
    const unit = await this.prisma.stockUnit.findUnique({
      where: { id: dto.stockUnitId },
    });
    if (!unit) throw new NotFoundException('Stock unit not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.stockUnit.update({
        where: { id: unit.id },
        data: { status: dto.status },
      });
      await tx.stockMovement.create({
        data: {
          stockUnitId: unit.id,
          type:
            dto.status === StockUnitStatus.SCRAPPED
              ? MovementType.SCRAP
              : MovementType.ADJUSTMENT,
          areaSqm: unit.areaSqm,
          quantity: unit.quantity,
          userId,
          note: dto.note,
        },
      });

      if (dto.status === StockUnitStatus.SCRAPPED) {
        await tx.wasteRecord.create({
          data: {
            materialId: unit.materialId,
            type: WasteType.DAMAGE,
            disposition: WasteDisposition.PENDING,
            areaSqm: unit.areaSqm,
            quantity: unit.quantity,
            lengthMm: unit.lengthMm,
            widthMm: unit.widthMm,
            isReusable: false,
            costImpact: unit.purchaseCost,
            recordedById: userId,
            remarks: dto.note ?? 'Scrapped from stock',
          },
        });
      }
      return updated;
    });
  }

  movements(stockUnitId: string) {
    return this.prisma.stockMovement.findMany({
      where: { stockUnitId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true } },
        job: { select: { id: true, code: true } },
      },
    });
  }
}
