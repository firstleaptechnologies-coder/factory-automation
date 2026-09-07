import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AttachmentKind,
  PricingMode,
  Prisma,
  RateUnit,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';
import { paginate } from '../../common/dto/pagination.dto';
import { FilesService, IncomingFile } from '../files/files.service';
import { ClientsService } from '../clients/clients.service';
import { DEFAULT_UNIT, LengthUnit, fromMm, toMm } from '@decor/shared';
import { lineAmount, round2 } from '../../common/utils/pricing';

/** Thickness is spoken in millimetres regardless of the sheet's display unit. */
const THICKNESS_UNIT: LengthUnit = 'MM';
import {
  AttachmentMetaDto,
  ChangeStatusDto,
  OrderQueryDto,
  PunchItemDto,
  PunchOrderDto,
  UpdateOrderDto,
} from './dto/order.dto';
import { MeasurementDto } from '../config/dto/config.dto';
import { tenantId } from '../../common/tenancy/tenant-context';

const ORDER_INCLUDE = {
  client: { select: { id: true, code: true, name: true, phone: true, company: true } },
  status: { select: { id: true, code: true, name: true, color: true, category: true } },
  workflow: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  items: {
    orderBy: { lineNo: 'asc' as const },
    include: {
      material: { select: { id: true, code: true, name: true, color: true } },
      materialThickness: { select: { id: true, valueMm: true, label: true } },
      sizePreset: { select: { id: true, code: true, name: true } },
    },
  },
  attachments: {
    orderBy: [{ kind: 'asc' as const }, { sortOrder: 'asc' as const }],
    include: {
      file: {
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          byteSize: true,
          originalByteSize: true,
          width: true,
          height: true,
        },
      },
    },
  },
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodeGeneratorService,
    private readonly files: FilesService,
    private readonly clients: ClientsService,
  ) {}

  /**
   * Punch an order.
   *
   * Everything happens in one transaction: creating the client inline, resolving
   * the workflow's starting status, snapshotting sizes into millimetres, and
   * writing the first history row. A half-punched order with no status would be
   * invisible on every board.
   */
  async punch(dto: PunchOrderDto, userId?: string, unit: LengthUnit = DEFAULT_UNIT) {
    if (!dto.clientId && !dto.newClient) {
      throw new BadRequestException('Pick an existing client or provide a new one');
    }
    if (!dto.items?.length) {
      throw new BadRequestException('An order needs at least one item');
    }

    const workflow = dto.workflowId
      ? await this.prisma.workflow.findUnique({
          where: { id: dto.workflowId },
          include: { statuses: true },
        })
      : await this.prisma.workflow.findFirst({
          where: { isDefault: true, isActive: true },
          include: { statuses: true },
        });

    if (!workflow) {
      throw new NotFoundException(
        'No workflow is available — an admin must configure one before orders can be punched',
      );
    }

    // An order punched directly has never been an enquiry, so it must be able
    // to start partway along — at "Order confirmed" rather than "Lead". Any
    // stage the admin marked as an entry point is a legal place to begin.
    const entryPoints = workflow.statuses.filter((status) => status.isEntryPoint);
    const initial = dto.startStatusId
      ? workflow.statuses.find((status) => status.id === dto.startStatusId)
      : (entryPoints.find((status) => !status.isInitial) ??
         workflow.statuses.find((status) => status.isInitial));

    if (!initial) {
      throw new BadRequestException(
        `Workflow "${workflow.name}" has no stage an order can start at. Mark one on the flow builder.`,
      );
    }
    if (dto.startStatusId && !initial.isEntryPoint && !initial.isInitial) {
      throw new BadRequestException(`${initial.name} is not a stage an order may start at`);
    }

    const items = await Promise.all(dto.items.map((item) => this.resolveItem(item)));
    const lumpSumSlab =
      (dto.pricingMode ?? PricingMode.ITEMISED) === PricingMode.LUMP_SUM
        ? await this.prisma.gstSlab.findFirst({
            where: dto.gstSlabId
              ? { id: dto.gstSlabId }
              : { isDefault: true, isActive: true },
          })
        : null;

    const money = totalsFor(
      dto.pricingMode ?? PricingMode.ITEMISED,
      items,
      dto.discount,
      dto.total,
      lumpSumSlab ? Number(lumpSumSlab.ratePct) : 0,
    );
    const code = await this.codes.next('order');

    return this.prisma.$transaction(async (tx) => {
      const clientId = dto.clientId ?? (await this.resolveNewClient(tx, dto, userId));

      // Remember the site so the next order to it is a pick, not a retype.
      const location = await tx.clientLocation.upsert({
        where: { clientId_name: { clientId, name: dto.location } },
        update: { useCount: { increment: 1 } },
        create: { tenantId: tenantId(), clientId, name: dto.location, useCount: 1 },
      });

      const order = await tx.order.create({
        data: {
          tenantId: tenantId(),
          code,
          clientId,
          location: dto.location,
          locationId: location.id,
          workflowId: workflow.id,
          statusId: initial.id,
          priority: dto.priority,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          notes: dto.notes,
          createdById: userId,
          pricingMode: money.pricingMode,
          subtotal: money.subtotal,
          discount: money.discount,
          total: money.total,
          gstSlabId: lumpSumSlab?.id ?? null,
          taxAmount: money.taxAmount,
          grandTotal: money.grandTotal,
          items: {
            create: items.map((item, index) => ({
              tenantId: tenantId(),
              lineNo: index + 1,
              ...item,
            })),
          },
          statusHistory: {
            create: {
              tenantId: tenantId(),
              toStatusId: initial.id,
              changedById: userId,
              note: 'Order punched',
            },
          },
        },
        include: ORDER_INCLUDE,
      });

      return this.withDisplayUnits(order, unit);
    });
  }

  /**
   * Create the inline client — unless we already know them.
   *
   * Punching lets anyone add a client without leaving the screen, which is the
   * right trade for speed but will quietly fill the database with duplicate
   * "Verma Interiors" rows as different people take orders for the same
   * customer. A phone number is the one thing that is reliably the same person
   * in this trade, so an exact match reuses the existing client instead of
   * making another. Name collisions are left alone: two different clients
   * genuinely can share a name.
   */
  private async resolveNewClient(
    tx: Prisma.TransactionClient,
    dto: PunchOrderDto,
    userId?: string,
  ): Promise<string> {
    const phone = dto.newClient!.phone?.replace(/\D/g, '');

    if (phone && phone.length >= 7) {
      const existing = await tx.client.findFirst({
        where: { isActive: true, phone: { contains: phone.slice(-10) } },
        select: { id: true },
      });
      if (existing) return existing.id;
    }

    const created = await tx.client.create({
      data: {
        ...dto.newClient!,
        tenantId: tenantId(),
        code: await this.codes.next('client', tx),
        createdById: userId,
      },
    });
    return created.id;
  }

  /**
   * Turn one punched line into stored columns.
   *
   * A size preset supplies defaults; explicit dimensions override it. Either
   * way the numbers are copied onto the item in millimetres rather than left as
   * a reference, so editing the preset next month cannot rewrite this order.
   */
  private async resolveItem(item: PunchItemDto) {
    const preset = item.sizePresetId
      ? await this.prisma.sizePreset.findUnique({ where: { id: item.sizePresetId } })
      : null;

    if (item.sizePresetId && !preset) {
      throw new NotFoundException(`Size preset ${item.sizePresetId} not found`);
    }

    const lengthMm = item.length ? measure(item.length) : preset ? Number(preset.lengthMm) : null;
    const widthMm = item.width ? measure(item.width) : preset ? Number(preset.widthMm) : null;

    if (lengthMm === null || widthMm === null) {
      throw new BadRequestException(
        'Each item needs a length and width — pick a size preset or enter both',
      );
    }
    if (lengthMm <= 0 || widthMm <= 0) {
      throw new BadRequestException('Sizes must be greater than zero');
    }

    const thickness = await this.resolveThickness(item, preset?.thicknessMm ?? null);

    const material = await this.prisma.material.findUnique({
      where: { id: item.materialId },
    });
    if (!material) throw new NotFoundException(`Material ${item.materialId} not found`);

    const quantity = item.quantity ?? 1;
    const rateUnit = item.rateUnit ?? RateUnit.PER_SQFT;
    const rate = item.rate ?? null;
    const amount = lineAmount({ rate, rateUnit, lengthMm, widthMm, quantity });

    // GST sits on what is sold, not on the board it was cut from — so the slab
    // is a property of the line. Falling back to the tenant's default keeps
    // punching fast without pretending the material decided it.
    const slab = item.gstSlabId
      ? await this.prisma.gstSlab.findFirst({ where: { id: item.gstSlabId } })
      : await this.prisma.gstSlab.findFirst({ where: { isDefault: true, isActive: true } });

    const gstRatePct = slab ? Number(slab.ratePct) : 0;

    return {
      sizePresetId: item.sizePresetId,
      lengthMm,
      widthMm,
      thicknessMm: thickness.valueMm,
      materialId: item.materialId,
      materialThicknessId: thickness.optionId,
      quantity,
      notes: item.notes,
      rate,
      rateUnit,
      // Priced now and stored: a rate edited next month must not restate what
      // this order was worth today. The same reasoning applies to the tax rate.
      amount,
      gstSlabId: slab?.id ?? null,
      gstRatePct,
      taxAmount: round2((amount * gstRatePct) / 100),
    };
  }

  private async resolveThickness(
    item: PunchItemDto,
    presetThicknessMm: Prisma.Decimal | number | null,
  ): Promise<{ valueMm: number | null; optionId?: string }> {
    if (item.materialThicknessId) {
      const option = await this.prisma.materialThickness.findUnique({
        where: { id: item.materialThicknessId },
      });
      if (!option) {
        throw new NotFoundException(`Thickness ${item.materialThicknessId} not found`);
      }
      if (option.materialId !== item.materialId) {
        throw new BadRequestException('That thickness does not belong to the chosen material');
      }
      return { valueMm: Number(option.valueMm), optionId: option.id };
    }

    if (item.thickness) return { valueMm: measure(item.thickness) };
    if (presetThicknessMm !== null) return { valueMm: Number(presetThicknessMm) };
    return { valueMm: null };
  }

  // -- reading --------------------------------------------------------------

  async list(query: OrderQueryDto) {
    const where: Prisma.OrderWhereInput = {
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.statusId ? { statusId: query.statusId } : {}),
      ...(query.materialId ? { items: { some: { materialId: query.materialId } } } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' as const } },
              { location: { contains: query.search, mode: 'insensitive' as const } },
              { client: { name: { contains: query.search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: ORDER_INCLUDE,
      }),
      this.prisma.order.count({ where }),
    ]);

    const unit = query.unit ?? DEFAULT_UNIT;
    return {
      ...paginate(data.map((order) => this.withDisplayUnits(order, unit)), total, query),
      unit,
    };
  }

  async findOne(id: string, unit: LengthUnit = DEFAULT_UNIT) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        ...ORDER_INCLUDE,
        statusHistory: {
          orderBy: { changedAt: 'desc' },
          include: {
            fromStatus: { select: { id: true, name: true, color: true } },
            toStatus: { select: { id: true, name: true, color: true } },
            changedBy: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return this.withDisplayUnits(order, unit);
  }

  /**
   * Attach the requested unit's numbers alongside the stored millimetres.
   *
   * The raw mm stay on the payload: a client that wants to re-render in another
   * unit can do it without another round trip, and there is never a question
   * about which field is authoritative.
   *
   * Thickness gets its own unit and defaults to millimetres. Length and width
   * are talked about in feet in this trade, but thickness never is — an 18 mm
   * board rendered in the same unit as the sheet reads "0.059 ft", which is
   * arithmetically correct and useless on a shop floor.
   */
  private withDisplayUnits<T extends { items: unknown[] }>(
    order: T,
    unit: LengthUnit,
    thicknessUnit: LengthUnit = THICKNESS_UNIT,
  ): T {
    const items = (order.items as Record<string, unknown>[]).map((item) => ({
      ...item,
      display: {
        unit,
        length: fromMm(Number(item.lengthMm), unit),
        width: fromMm(Number(item.widthMm), unit),
        thicknessUnit,
        thickness:
          item.thicknessMm === null || item.thicknessMm === undefined
            ? null
            : fromMm(Number(item.thicknessMm), thicknessUnit),
      },
    }));
    return { ...order, items } as T;
  }

  // -- writing --------------------------------------------------------------

  async update(id: string, dto: UpdateOrderDto) {
    const existing = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existing) throw new NotFoundException(`Order ${id} not found`);

    const pricingMode = dto.pricingMode ?? existing.pricingMode;
    const money =
      dto.pricingMode !== undefined || dto.discount !== undefined || dto.total !== undefined
        ? totalsFor(
            pricingMode,
            existing.items.map((item) => ({
              amount: Number(item.amount),
              taxAmount: Number(item.taxAmount),
            })),
            dto.discount ?? Number(existing.discount),
            dto.total ?? Number(existing.total),
          )
        : null;

    return this.prisma.order.update({
      where: { id },
      data: {
        location: dto.location,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        notes: dto.notes,
        ...(money
          ? {
              pricingMode: money.pricingMode,
              subtotal: money.subtotal,
              discount: money.discount,
              total: money.total,
              taxAmount: money.taxAmount,
              grandTotal: money.grandTotal,
            }
          : {}),
      },
      include: ORDER_INCLUDE,
    });
  }

  /**
   * Move an order along the flow the admin drew.
   *
   * The move is only allowed if an edge exists on the canvas, so the graph is
   * genuinely the source of truth rather than documentation of it.
   */
  async changeStatus(id: string, dto: ChangeStatusDto, user?: { id: string; role?: string }) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { status: true },
    });
    if (!order) throw new NotFoundException(`Order ${id} not found`);

    if (order.statusId === dto.toStatusId) return this.findOne(id);

    const transition = await this.prisma.workflowTransition.findUnique({
      where: {
        workflowId_fromStatusId_toStatusId: {
          workflowId: order.workflowId,
          fromStatusId: order.statusId,
          toStatusId: dto.toStatusId,
        },
      },
      include: { toStatus: true },
    });

    if (!transition) {
      const target = await this.prisma.workflowStatus.findUnique({
        where: { id: dto.toStatusId },
      });
      throw new BadRequestException(
        `The flow does not allow moving from ${order.status.name} to ${target?.name ?? 'that status'}`,
      );
    }

    if (
      transition.allowedRoles.length > 0 &&
      user &&
      user.role !== UserRole.ADMIN &&
      !transition.allowedRoles.includes(user.role as UserRole)
    ) {
      throw new BadRequestException(
        `Your role cannot make this move — it is limited to ${transition.allowedRoles.join(', ')}`,
      );
    }

    if (transition.requiresNote && !dto.note?.trim()) {
      throw new BadRequestException(
        `Moving to ${transition.toStatus.name} requires a note explaining why`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id },
        data: { statusId: dto.toStatusId },
      }),
      this.prisma.orderStatusHistory.create({
        data: {
          tenantId: tenantId(),
          orderId: id,
          fromStatusId: order.statusId,
          toStatusId: dto.toStatusId,
          note: dto.note,
          changedById: user?.id,
        },
      }),
    ]);

    return this.findOne(id);
  }

  // -- attachments ----------------------------------------------------------

  async addAttachments(
    orderId: string,
    uploads: IncomingFile[],
    meta: AttachmentMetaDto,
    userId?: string,
  ) {
    await this.findOne(orderId);

    if (meta.kind === AttachmentKind.REFERENCE_IMAGE && !meta.description?.trim()) {
      throw new BadRequestException(
        'A reference image needs a description — what is the client pointing at in it?',
      );
    }
    if (!uploads?.length) throw new BadRequestException('No files were received');

    const existing = await this.prisma.orderAttachment.count({
      where: { orderId, kind: meta.kind },
    });

    const created = [];
    for (const [index, upload] of uploads.entries()) {
      const file = await this.files.ingest(upload, meta.kind, userId);
      created.push(
        await this.prisma.orderAttachment.create({
          data: {
            tenantId: tenantId(),
            orderId,
            kind: meta.kind,
            description: meta.description,
            sortOrder: existing + index,
            fileId: file.id,
          },
          include: { file: true },
        }),
      );
    }
    return created;
  }

  async removeAttachment(id: string) {
    const attachment = await this.prisma.orderAttachment.findUnique({ where: { id } });
    if (!attachment) throw new NotFoundException(`Attachment ${id} not found`);
    return this.prisma.orderAttachment.delete({ where: { id } });
  }

  /** Board view: orders grouped under the statuses of a workflow. */
  async board(workflowId?: string) {
    const workflow = workflowId
      ? await this.prisma.workflow.findUnique({
          where: { id: workflowId },
          include: { statuses: { orderBy: { sortOrder: 'asc' } } },
        })
      : await this.prisma.workflow.findFirst({
          where: { isDefault: true },
          include: { statuses: { orderBy: { sortOrder: 'asc' } } },
        });

    if (!workflow) throw new NotFoundException('No workflow configured');

    const orders = await this.prisma.order.findMany({
      where: { workflowId: workflow.id },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: ORDER_INCLUDE,
    });

    return {
      workflow: { id: workflow.id, code: workflow.code, name: workflow.name },
      columns: workflow.statuses.map((status) => ({
        status,
        orders: orders.filter((order) => order.statusId === status.id),
      })),
    };
  }
}

function measure(input: MeasurementDto): number {
  return toMm(input.value, input.unit);
}


/**
 * The order's money, from however it was quoted.
 *
 * ITEMISED adds the priced lines and subtracts a discount. LUMP_SUM keeps the
 * figure that was actually given to the client and leaves the lines unpriced —
 * back-calculating a rate from it would invent a number nobody agreed to, and
 * that number would drift the moment a size was corrected.
 */
function totalsFor(
  pricingMode: PricingMode,
  items: { amount: number; taxAmount?: number }[],
  discount = 0,
  quotedTotal = 0,
  lumpSumTaxPct = 0,
): {
  pricingMode: PricingMode;
  subtotal: number;
  discount: number;
  total: number;
  taxAmount: number;
  grandTotal: number;
} {
  if (pricingMode === PricingMode.LUMP_SUM) {
    const total = round2(quotedTotal);
    // One slab covers the whole quoted figure, because a lump sum has no lines
    // to tax individually.
    const taxAmount = round2((total * lumpSumTaxPct) / 100);
    return {
      pricingMode,
      subtotal: total,
      discount: 0,
      total,
      taxAmount,
      grandTotal: round2(total + taxAmount),
    };
  }

  const subtotal = round2(items.reduce((sum, item) => sum + item.amount, 0));
  const applied = Math.min(round2(discount), subtotal);
  const total = round2(subtotal - applied);
  const taxAmount = round2(items.reduce((sum, item) => sum + (item.taxAmount ?? 0), 0));

  return {
    pricingMode,
    subtotal,
    discount: applied,
    total,
    taxAmount,
    grandTotal: round2(total + taxAmount),
  };
}
