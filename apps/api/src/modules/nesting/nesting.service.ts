import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NestPlanStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';
import {
  areaSqm,
  computeYield,
  isReusableOffcut,
  round,
} from '../../common/utils/geometry';
import {
  NestPartInput,
  nestParts,
  selectRecoverableOffcuts,
} from '../../common/utils/nesting';
import {
  CreateNestPlanDto,
  PreviewNestDto,
  UpdateNestStatusDto,
} from './dto/nest.dto';

@Injectable()
export class NestingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodeGeneratorService,
  ) {}

  /** Runs the nest and reports the numbers without persisting anything. */
  async preview(dto: PreviewNestDto) {
    const { material, sheetLengthMm, sheetWidthMm, kerfMm } = await this.resolveSheet(dto);

    const input: NestPartInput[] = dto.parts.map((part, index) => ({
      id: part.orderItemId ?? `part-${index}`,
      label: part.label,
      lengthMm: part.lengthMm,
      widthMm: part.widthMm,
      quantity: part.quantity,
      allowRotation: part.allowRotation ?? !material.hasGrain,
    }));

    const result = nestParts(input, {
      sheetLengthMm,
      sheetWidthMm,
      kerfMm,
      marginMm: dto.marginMm ?? 0,
    });

    const sheetAreaTotal = round(
      areaSqm(sheetLengthMm, sheetWidthMm) * result.sheetsUsed,
      4,
    );
    const partsArea = round(
      result.placements.reduce((sum, p) => sum + areaSqm(p.lengthMm, p.widthMm), 0),
      4,
    );

    // Only free rectangles big enough to hold a future part count as recoverable
    // offcuts, and only a non-overlapping set of them — the free rectangles the
    // nester tracks overlap each other, so summing them all would report more
    // leftover than the sheet contains.
    const offcuts = selectRecoverableOffcuts(result.freeRects, isReusableOffcut);

    const offcutArea = round(
      offcuts.reduce((sum, rect) => sum + areaSqm(rect.w, rect.h), 0),
      4,
    );

    const yieldNumbers = computeYield({
      sheetAreaSqm: sheetAreaTotal,
      partsAreaSqm: partsArea,
      offcutAreaSqm: offcutArea,
    });

    const costPerSqm =
      Number(material.standardCost) /
      Math.max(areaSqm(Number(material.lengthMm ?? sheetLengthMm), Number(material.widthMm ?? sheetWidthMm)), 1);

    return {
      material: { id: material.id, code: material.code, name: material.name },
      sheetLengthMm,
      sheetWidthMm,
      kerfMm,
      sheetsUsed: result.sheetsUsed,
      sheetAreaSqm: sheetAreaTotal,
      partsAreaSqm: partsArea,
      offcutAreaSqm: offcutArea,
      ...yieldNumbers,
      wasteCost: round(yieldNumbers.wasteAreaSqm * costPerSqm, 2),
      placements: result.placements,
      recoverableOffcuts: offcuts.map((rect) => ({
        sheetIndex: rect.sheetIndex,
        xMm: round(rect.x, 2),
        yMm: round(rect.y, 2),
        lengthMm: round(rect.w, 2),
        widthMm: round(rect.h, 2),
        areaSqm: areaSqm(rect.w, rect.h),
      })),
      unplaced: result.unplaced,
    };
  }

  async create(dto: CreateNestPlanDto) {
    const preview = await this.preview(dto);
    if (preview.unplaced.length) {
      throw new BadRequestException(
        `These parts do not fit on a ${preview.sheetLengthMm}×${preview.sheetWidthMm} sheet: ${preview.unplaced
          .map((u) => `${u.label} ×${u.quantity}`)
          .join(', ')}`,
      );
    }

    const code = await this.codes.next('nestPlan');
    const labelToOrderItem = new Map(
      dto.parts.map((p) => [p.label, p.orderItemId]),
    );

    return this.prisma.nestPlan.create({
      data: {
        code,
        materialId: dto.materialId,
        sheetLengthMm: preview.sheetLengthMm,
        sheetWidthMm: preview.sheetWidthMm,
        sheetCount: preview.sheetsUsed,
        sheetAreaSqm: preview.sheetAreaSqm,
        partsAreaSqm: preview.partsAreaSqm,
        offcutAreaSqm: preview.offcutAreaSqm,
        wasteAreaSqm: preview.wasteAreaSqm,
        utilizationPct: preview.utilizationPct,
        kerfMm: preview.kerfMm,
        parts: {
          create: preview.placements.map((placement) => ({
            orderItemId: labelToOrderItem.get(placement.label) ?? undefined,
            label: placement.label,
            quantity: 1,
            lengthMm: placement.lengthMm,
            widthMm: placement.widthMm,
            sheetIndex: placement.sheetIndex,
            posXMm: round(placement.xMm, 2),
            posYMm: round(placement.yMm, 2),
            rotationDeg: placement.rotationDeg,
          })),
        },
      },
      include: { parts: true, material: { select: { code: true, name: true } } },
    });
  }

  list(status?: NestPlanStatus) {
    return this.prisma.nestPlan.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        material: { select: { id: true, code: true, name: true } },
        _count: { select: { parts: true, jobs: true } },
      },
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.nestPlan.findUnique({
      where: { id },
      include: {
        material: true,
        parts: { orderBy: [{ sheetIndex: 'asc' }, { posYMm: 'asc' }] },
        jobs: { select: { id: true, code: true, status: true } },
      },
    });
    if (!plan) throw new NotFoundException(`Nest plan ${id} not found`);
    return plan;
  }

  async setStatus(id: string, dto: UpdateNestStatusDto) {
    await this.findOne(id);
    return this.prisma.nestPlan.update({ where: { id }, data: { status: dto.status } });
  }

  private async resolveSheet(dto: CreateNestPlanDto) {
    const material = await this.prisma.material.findUnique({
      where: { id: dto.materialId },
    });
    if (!material) throw new NotFoundException('Material not found');

    const sheetLengthMm = dto.sheetLengthMm ?? Number(material.lengthMm ?? 0);
    const sheetWidthMm = dto.sheetWidthMm ?? Number(material.widthMm ?? 0);
    if (!sheetLengthMm || !sheetWidthMm) {
      throw new BadRequestException(
        `${material.name} has no standard sheet size — pass sheetLengthMm and sheetWidthMm`,
      );
    }

    return {
      material,
      sheetLengthMm,
      sheetWidthMm,
      kerfMm: dto.kerfMm ?? Number(material.defaultKerfMm),
    };
  }
}
