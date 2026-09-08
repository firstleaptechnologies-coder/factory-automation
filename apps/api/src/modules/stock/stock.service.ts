import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMoveKind } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { tenantId } from '../../common/tenancy/tenant-context';
import { dateOnly } from '../employees/employees.service';
import { StockMoveDto, StockQueryDto, WasteQueryDto } from '../purchases/dto/purchase.dto';
import { needsReorder, onHand, value, wasteSummary } from './stock';

/** Which kinds a person has to explain. */
const NEEDS_A_REASON: StockMoveKind[] = [StockMoveKind.WASTE, StockMoveKind.ADJUSTMENT];

/** Which kinds take material off the rack, and so cannot take more than is there. */
const TAKES_AWAY: StockMoveKind[] = [
  StockMoveKind.CONSUMPTION,
  StockMoveKind.WASTE,
  StockMoveKind.RETURN,
];

const MOVE_INCLUDE = {
  material: { select: { id: true, code: true, name: true, stockUnit: true } },
  thickness: { select: { id: true, valueMm: true, label: true } },
  order: { select: { id: true, code: true } },
  recordedBy: { select: { id: true, name: true } },
} as const;

/**
 * What is on the rack, and what became of what is not.
 *
 * A level is never set here, only summed from the moves. A quantity somebody
 * can type over is a quantity with no explanation behind it, and "where did
 * four sheets go" is the question this module exists to answer — so a
 * stocktake that disagrees with the books is itself a move, with a reason.
 */
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The rack, material by material.
   *
   * Every move is read and summed rather than a stored level fetched. A shop
   * this size has thousands of moves, not millions, and the alternative is a
   * cached number that can be wrong — which is the one thing a stock figure
   * must never be.
   */
  async levels(query: StockQueryDto) {
    const materials = await this.prisma.material.findMany({
      where: {
        isActive: true,
        ...(query.materialId ? { id: query.materialId } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { code: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { thicknesses: { where: { isActive: true }, orderBy: { valueMm: 'asc' } } },
    });

    const moves = await this.prisma.stockMove.findMany({
      where: { materialId: { in: materials.map((material) => material.id) } },
      select: { materialId: true, thicknessId: true, kind: true, quantity: true, rate: true },
      orderBy: { at: 'asc' },
    });

    const rows = materials.map((material) => {
      const mine = moves.filter((move) => move.materialId === material.id);
      const rack = value(mine.map(asMove));

      return {
        material: {
          id: material.id,
          code: material.code,
          name: material.name,
          color: material.color,
          stockUnit: material.stockUnit,
          reorderLevel: material.reorderLevel == null ? null : Number(material.reorderLevel),
        },
        quantity: rack.quantity,
        value: rack.value,
        averageRate: rack.averageRate,
        low: needsReorder(rack.quantity, material.reorderLevel == null ? null : Number(material.reorderLevel)),
        // Broken down by thickness, because 18mm and 6mm ply are not
        // interchangeable and a single figure would say they were.
        byThickness: material.thicknesses.map((thickness) => ({
          thickness: {
            id: thickness.id,
            valueMm: Number(thickness.valueMm),
            label: thickness.label,
          },
          quantity: onHand(
            mine.filter((move) => move.thicknessId === thickness.id).map(asMove),
          ),
        })),
      };
    });

    const filtered = query.lowOnly === 'true' ? rows.filter((row) => row.low) : rows;

    return {
      rows: filtered,
      totals: {
        value: filtered.reduce((sum, row) => sum + row.value, 0),
        low: rows.filter((row) => row.low).length,
      },
    };
  }

  /** Every move against one material, newest first — the story of the rack. */
  moves(materialId: string) {
    return this.prisma.stockMove.findMany({
      where: { materialId },
      orderBy: [{ at: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: MOVE_INCLUDE,
    });
  }

  /**
   * Records a move that is not a delivery.
   *
   * Issuing to an order, the offcut that comes back, the waste, a count that
   * disagreed. Deliveries are not here: stock arrives against a purchase, so
   * that everything on the rack has a bill behind it.
   */
  async record(dto: StockMoveDto, userId?: string) {
    if (dto.kind === StockMoveKind.RECEIPT) {
      throw new BadRequestException(
        'Stock arrives against a purchase, so that it always has a bill behind it.',
      );
    }
    if (NEEDS_A_REASON.includes(dto.kind) && !dto.reason?.trim()) {
      throw new BadRequestException('Say why — a sheet that vanished with no reason is the thing this is for');
    }

    const material = await this.prisma.material.findFirst({
      where: { id: dto.materialId },
      select: { id: true, name: true, stockUnit: true },
    });
    if (!material) throw new NotFoundException('Material not found');

    if (dto.orderId) {
      const order = await this.prisma.order.findFirst({
        where: { id: dto.orderId },
        select: { id: true },
      });
      if (!order) throw new NotFoundException('Order not found');
    }

    if (TAKES_AWAY.includes(dto.kind)) {
      const available = await this.quantityOf(dto.materialId, dto.thicknessId);
      if (dto.quantity > available) {
        throw new BadRequestException(
          `There is only ${available} ${material.stockUnit} of ${material.name} on the rack. Record what arrived first, or count it.`,
        );
      }
    }

    return this.prisma.stockMove.create({
      data: {
        tenantId: tenantId(),
        materialId: dto.materialId,
        thicknessId: dto.thicknessId ?? null,
        kind: dto.kind,
        // Signed here, once, so nothing downstream has to remember which way
        // a kind goes.
        quantity: TAKES_AWAY.includes(dto.kind) ? -dto.quantity : dto.quantity,
        unit: dto.unit?.trim() || material.stockUnit,
        orderId: dto.orderId ?? null,
        reason: dto.reason?.trim() || null,
        note: dto.note?.trim() || null,
        at: dto.at ? dateOnly(dto.at) : new Date(),
        recordedById: userId ?? null,
      },
      include: MOVE_INCLUDE,
    });
  }

  /**
   * What became of the material that left the rack.
   *
   * The number the owner cannot see today: how much was issued, how much came
   * back as usable offcut, and how much was cut away and gone. Per material,
   * because a shop wasting a fifth of its acrylic and none of its ply has one
   * problem rather than a general one.
   */
  async waste(query: WasteQueryDto) {
    const where: Prisma.StockMoveWhereInput = {
      at: { gte: dateOnly(query.from), lte: dateOnly(query.to) },
      kind: { in: [StockMoveKind.CONSUMPTION, StockMoveKind.OFFCUT, StockMoveKind.WASTE] },
      ...(query.materialId ? { materialId: query.materialId } : {}),
    };

    const moves = await this.prisma.stockMove.findMany({
      where,
      select: {
        materialId: true,
        kind: true,
        quantity: true,
        rate: true,
        material: { select: { id: true, code: true, name: true, stockUnit: true } },
      },
    });

    const byMaterial = new Map<string, typeof moves>();
    for (const move of moves) {
      const list = byMaterial.get(move.materialId) ?? [];
      list.push(move);
      byMaterial.set(move.materialId, list);
    }

    const rows = [...byMaterial.values()]
      .map((mine) => ({
        material: mine[0].material,
        ...wasteSummary(mine.map(asMove)),
      }))
      .sort((a, b) => b.wasted - a.wasted);

    return {
      from: query.from,
      to: query.to,
      rows,
      totals: wasteSummary(moves.map(asMove)),
    };
  }

  /** What is on the rack of one material, at one thickness or across all. */
  private async quantityOf(materialId: string, thicknessId?: string): Promise<number> {
    const moves = await this.prisma.stockMove.findMany({
      where: { materialId, ...(thicknessId ? { thicknessId } : {}) },
      select: { kind: true, quantity: true, rate: true },
    });
    return onHand(moves.map(asMove));
  }
}

/** A row as the arithmetic reads it. */
export function asMove(row: {
  kind: StockMoveKind;
  quantity: Prisma.Decimal | number;
  rate?: Prisma.Decimal | number | null;
}) {
  return {
    kind: row.kind,
    quantity: Number(row.quantity),
    rate: row.rate == null ? null : Number(row.rate),
  };
}
