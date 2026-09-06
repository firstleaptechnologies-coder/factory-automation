import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  OrderItemStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';
import { round } from '../../common/utils/geometry';
import { paginate } from '../../common/dto/pagination.dto';
import {
  CreateOrderDto,
  OrderQueryDto,
  UpdateOrderStatusDto,
} from './dto/order.dto';

/** Statuses an order may legally move to. Keeps the shop floor and sales from
 *  quietly dragging an order backwards once material has been cut. */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.IN_PRODUCTION, OrderStatus.CANCELLED],
  IN_PRODUCTION: [OrderStatus.READY, OrderStatus.PARTIALLY_DELIVERED, OrderStatus.CANCELLED],
  READY: [OrderStatus.PARTIALLY_DELIVERED, OrderStatus.DELIVERED],
  PARTIALLY_DELIVERED: [OrderStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodeGeneratorService,
  ) {}

  async list(query: OrderQueryDto) {
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' as const } },
              { poNumber: { contains: query.search, mode: 'insensitive' as const } },
              { customer: { name: { contains: query.search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: [{ orderDate: 'desc' }],
        include: {
          customer: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true, jobs: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: {
          orderBy: { lineNo: 'asc' },
          include: {
            material: { select: { id: true, code: true, name: true, uom: true } },
            design: { select: { id: true, code: true, name: true } },
          },
        },
        jobs: {
          orderBy: { createdAt: 'asc' },
          include: { machine: { select: { id: true, code: true, name: true } } },
        },
        dispatches: { include: { items: true } },
      },
    });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }

  async create(dto: CreateOrderDto) {
    if (!dto.items?.length) {
      throw new BadRequestException('An order needs at least one line item');
    }

    const materialIds = [...new Set(dto.items.map((i) => i.materialId))];
    const materials = await this.prisma.material.findMany({
      where: { id: { in: materialIds } },
      select: { id: true, gstRatePct: true },
    });
    if (materials.length !== materialIds.length) {
      throw new BadRequestException('One or more materials not found');
    }
    const gstById = new Map(materials.map((m) => [m.id, Number(m.gstRatePct)]));

    let subtotal = 0;
    let taxAmount = 0;
    const items = dto.items.map((item, index) => {
      const amount = round(item.quantity * item.unitPrice, 2);
      subtotal += amount;
      taxAmount += round((amount * (gstById.get(item.materialId) ?? 0)) / 100, 2);
      return {
        lineNo: index + 1,
        description: item.description,
        designId: item.designId,
        materialId: item.materialId,
        quantity: item.quantity,
        uom: item.uom,
        lengthMm: item.lengthMm,
        widthMm: item.widthMm,
        thicknessMm: item.thicknessMm,
        unitPrice: item.unitPrice,
        amount,
      };
    });

    const code = await this.codes.next('order');

    return this.prisma.order.create({
      data: {
        code,
        customerId: dto.customerId,
        poNumber: dto.poNumber,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        notes: dto.notes,
        subtotal: round(subtotal, 2),
        taxAmount: round(taxAmount, 2),
        total: round(subtotal + taxAmount, 2),
        items: { create: items },
      },
      include: { items: true, customer: true },
    });
  }

  async setStatus(id: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);

    if (!ALLOWED_TRANSITIONS[order.status].includes(dto.status)) {
      throw new BadRequestException(
        `Cannot move an order from ${order.status} to ${dto.status}`,
      );
    }

    return this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.status === OrderStatus.CONFIRMED
          ? { items: { updateMany: { where: {}, data: { status: OrderItemStatus.PENDING } } } }
          : {}),
      },
      include: { items: true },
    });
  }

  /** Order lines that are confirmed but have no job yet — the planner's inbox. */
  async pendingForPlanning() {
    return this.prisma.orderItem.findMany({
      where: {
        status: { in: [OrderItemStatus.PENDING] },
        order: { status: { in: [OrderStatus.CONFIRMED, OrderStatus.IN_PRODUCTION] } },
        jobs: { none: {} },
      },
      orderBy: [{ order: { dueDate: 'asc' } }],
      include: {
        material: { select: { id: true, code: true, name: true, categoryId: true } },
        order: {
          select: {
            id: true,
            code: true,
            dueDate: true,
            priority: true,
            customer: { select: { name: true } },
          },
        },
      },
    });
  }
}
