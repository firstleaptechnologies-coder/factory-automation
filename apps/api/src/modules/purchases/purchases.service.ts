import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PurchaseStatus, StockMoveKind } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService, accountFor } from '../ledger/ledger.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';
import { tenantId } from '../../common/tenancy/tenant-context';
import { paginate } from '../../common/dto/pagination.dto';
import { dateOnly } from '../employees/employees.service';
import { lineTotal, purchaseTotals, round3 } from '../stock/stock';
import {
  BillDto,
  PayPurchaseDto,
  PurchaseDto,
  PurchaseQueryDto,
  ReceiveDto,
} from './dto/purchase.dto';

const INCLUDE = {
  vendor: { select: { id: true, code: true, name: true, gstin: true } },
  items: {
    include: {
      material: { select: { id: true, code: true, name: true, stockUnit: true } },
      thickness: { select: { id: true, valueMm: true, label: true } },
    },
  },
} as const;

/**
 * What the shop bought, from ordering it to paying for it.
 *
 * Ordering and billing are one row rather than two. A shop this size sends an
 * order and gets a bill against it; splitting them would mean two documents to
 * reconcile for the one conversation that actually happened. What separates
 * them is time — the vendor's bill number and date are filled in when the
 * paperwork arrives.
 *
 * Stock only ever arrives through here, so everything on the rack has a bill
 * behind it. That is the line this module draws: a purchase is the source of
 * anything that becomes stock, and an `Expense` is spend that does not.
 */
@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly codes: CodeGeneratorService,
  ) {}

  async list(query: PurchaseQueryDto) {
    const where = purchaseFilter(query);

    const [rows, count] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: query.skip,
        take: query.limit,
        include: {
          vendor: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.purchase.count({ where }),
    ]);

    return paginate(rows, count, { page: query.page, limit: query.limit });
  }

  async get(id: string) {
    const row = await this.prisma.purchase.findFirst({ where: { id }, include: INCLUDE });
    if (!row) throw new NotFoundException('Purchase not found');
    return row;
  }

  /**
   * Writes an order.
   *
   * Draft on purpose: what a shop types on the phone to a supplier is a list
   * it is still changing, and an order that was sent the moment it was typed
   * would have no state in which it could be corrected.
   */
  async create(dto: PurchaseDto, userId?: string) {
    if (!dto.items.length) throw new BadRequestException('An order needs at least one line');
    await this.requireVendor(dto.vendorId);
    await this.requireMaterials(dto.items);

    const totals = purchaseTotals(dto.items, dto.otherCharges ?? 0);

    return this.prisma.purchase.create({
      data: {
        tenantId: tenantId(),
        code: await this.codes.next('purchase'),
        vendorId: dto.vendorId,
        expectedOn: dto.expectedOn ? dateOnly(dto.expectedOn) : null,
        otherCharges: dto.otherCharges ?? 0,
        note: dto.note?.trim() || null,
        createdById: userId,
        ...totals,
        items: {
          create: dto.items.map((item) => ({
            tenantId: tenantId(),
            materialId: item.materialId,
            thicknessId: item.thicknessId ?? null,
            unit: item.unit?.trim() || 'sheet',
            quantity: item.quantity,
            rate: item.rate,
            gstRatePct: item.gstRatePct ?? 0,
            taxAmount: item.taxAmount ?? 0,
            lineTotal: lineTotal(item),
            note: item.note?.trim() || null,
          })),
        },
      },
      include: INCLUDE,
    });
  }

  /** Replaces the lines on a draft. Anything further along is fixed. */
  async update(id: string, dto: PurchaseDto) {
    const purchase = await this.requireDraft(id);
    await this.requireVendor(dto.vendorId);
    await this.requireMaterials(dto.items);
    if (!dto.items.length) throw new BadRequestException('An order needs at least one line');

    const totals = purchaseTotals(dto.items, dto.otherCharges ?? 0);

    await this.prisma.$transaction([
      this.prisma.purchaseItem.deleteMany({ where: { purchaseId: purchase.id } }),
      this.prisma.purchase.update({
        where: { id },
        data: {
          vendorId: dto.vendorId,
          expectedOn: dto.expectedOn ? dateOnly(dto.expectedOn) : null,
          otherCharges: dto.otherCharges ?? 0,
          note: dto.note?.trim() || null,
          ...totals,
          items: {
            create: dto.items.map((item) => ({
              tenantId: tenantId(),
              materialId: item.materialId,
              thicknessId: item.thicknessId ?? null,
              unit: item.unit?.trim() || 'sheet',
              quantity: item.quantity,
              rate: item.rate,
              gstRatePct: item.gstRatePct ?? 0,
              taxAmount: item.taxAmount ?? 0,
              lineTotal: lineTotal(item),
              note: item.note?.trim() || null,
            })),
          },
        },
      }),
    ]);

    return this.get(id);
  }

  /** Sends it. From here the lines are what was asked for. */
  async place(id: string) {
    await this.requireDraft(id);
    await this.prisma.purchase.update({
      where: { id },
      data: { status: PurchaseStatus.ORDERED, orderedOn: new Date() },
    });
    return this.get(id);
  }

  /**
   * Records a delivery.
   *
   * Stock arrives here and nowhere else, so everything on the rack has a bill
   * behind it. A delivery can be partial and there can be several — which is
   * why what has arrived is counted on each line rather than inferred from the
   * status.
   */
  async receive(id: string, dto: ReceiveDto, userId?: string) {
    const purchase = await this.get(id);
    if (purchase.status === PurchaseStatus.DRAFT) {
      throw new BadRequestException('Send the order before receiving against it');
    }
    if (purchase.status === PurchaseStatus.CANCELLED) {
      throw new BadRequestException('That order was cancelled');
    }
    if (!dto.lines.length) throw new BadRequestException('Nothing was received');

    const byId = new Map(purchase.items.map((item) => [item.id, item]));
    const at = dto.at ? dateOnly(dto.at) : new Date();

    for (const line of dto.lines) {
      const item = byId.get(line.purchaseItemId);
      if (!item) throw new NotFoundException('That line is not on this order');

      const already = Number(item.receivedQuantity);
      const ordered = Number(item.quantity);
      if (round3(already + line.quantity) > round3(ordered)) {
        throw new BadRequestException(
          `More ${item.material.name} has arrived than was ordered. Correct the order first.`,
        );
      }
    }

    await this.prisma.$transaction([
      ...dto.lines.map((line) =>
        this.prisma.purchaseItem.update({
          where: { id: line.purchaseItemId },
          data: { receivedQuantity: { increment: line.quantity } },
        }),
      ),
      ...dto.lines.map((line) => {
        const item = byId.get(line.purchaseItemId)!;
        return this.prisma.stockMove.create({
          data: {
            tenantId: tenantId(),
            materialId: item.materialId,
            thicknessId: item.thicknessId,
            kind: StockMoveKind.RECEIPT,
            quantity: line.quantity,
            unit: item.unit,
            rate: item.rate,
            purchaseId: purchase.id,
            purchaseItemId: item.id,
            note: dto.note?.trim() || null,
            at,
            recordedById: userId ?? null,
          },
        });
      }),
    ]);

    await this.settleStatus(id);
    return this.get(id);
  }

  /** The vendor's own paperwork, once it arrives. */
  async bill(id: string, dto: BillDto) {
    const purchase = await this.get(id);
    if (purchase.status === PurchaseStatus.DRAFT) {
      throw new BadRequestException('Send the order before entering a bill against it');
    }

    const totals = purchaseTotals(
      purchase.items.map((item) => ({
        quantity: Number(item.quantity),
        rate: Number(item.rate),
        taxAmount: Number(item.taxAmount),
      })),
      dto.otherCharges ?? Number(purchase.otherCharges),
    );

    await this.prisma.purchase.update({
      where: { id },
      data: {
        billNumber: dto.billNumber.trim(),
        billedOn: dateOnly(dto.billedOn),
        otherCharges: dto.otherCharges ?? purchase.otherCharges,
        ...totals,
      },
    });
    return this.get(id);
  }

  /**
   * Pays it, and posts it.
   *
   * A bill first, because paying against nothing is how a shop ends up with a
   * payment nobody can match to a document. The posting names the vendor and
   * the bill, so the accountant can find it from either side.
   */
  async pay(id: string, dto: PayPurchaseDto, userId?: string) {
    const purchase = await this.get(id);
    if (purchase.paidOn) throw new BadRequestException('That purchase has already been paid');
    if (!purchase.billNumber) {
      throw new BadRequestException('Enter the vendor’s bill before paying it');
    }

    const paidOn = dto.paidOn ? dateOnly(dto.paidOn) : new Date();
    await this.prisma.purchase.update({
      where: { id },
      data: { paidOn, paidMode: dto.mode },
    });

    await this.ledger.post({
      sourceType: 'Purchase',
      sourceId: purchase.id,
      at: paidOn,
      direction: 'OUT',
      account: accountFor(dto.mode),
      amount: Number(purchase.total),
      voucher: 'PAYMENT',
      party: purchase.vendor.name,
      accountHead: 'Purchases',
      taxAmount: Number(purchase.taxTotal),
      gstin: purchase.vendor.gstin,
      reference: purchase.billNumber,
      note: `${purchase.code} · ${purchase.vendor.name}`,
      recordedById: userId ?? null,
    });

    return this.get(id);
  }

  /**
   * Cancels one nothing has arrived against.
   *
   * Once a delivery has been recorded the order is part of the stock story and
   * cannot be made to have never happened — the material is on the rack.
   */
  async cancel(id: string) {
    const purchase = await this.get(id);
    if (purchase.status === PurchaseStatus.CANCELLED) {
      throw new BadRequestException('That order is already cancelled');
    }
    if (purchase.items.some((item) => Number(item.receivedQuantity) > 0)) {
      throw new BadRequestException(
        'Something has already arrived against that order. It cannot be cancelled.',
      );
    }
    if (purchase.paidOn) throw new BadRequestException('That purchase has been paid');

    await this.prisma.purchase.update({
      where: { id },
      data: { status: PurchaseStatus.CANCELLED },
    });
    return this.get(id);
  }

  // -- internals ------------------------------------------------------------

  private async requireVendor(vendorId: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId },
      select: { id: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
  }

  private async requireMaterials(items: { materialId: string }[]) {
    const ids = [...new Set(items.map((item) => item.materialId))];
    const known = await this.prisma.material.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (known.length !== ids.length) {
      throw new NotFoundException('Something on that order is not a material here');
    }
  }

  private async requireDraft(id: string) {
    const purchase = await this.prisma.purchase.findFirst({ where: { id } });
    if (!purchase) throw new NotFoundException('Purchase not found');
    if (purchase.status !== PurchaseStatus.DRAFT) {
      throw new BadRequestException(
        'That order has been sent. Receive against it rather than rewriting it.',
      );
    }
    return purchase;
  }

  /** Moves the order to where its lines actually are. */
  private async settleStatus(id: string) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id },
      include: { items: true },
    });
    if (!purchase) return;

    await this.prisma.purchase.update({
      where: { id },
      data: { status: statusFor(purchase.items) },
    });
  }
}

/**
 * Where an order has got to, from its lines.
 *
 * Derived rather than set, so an order cannot say RECEIVED while a line is
 * still outstanding — which is the state a shop chases a supplier from.
 */
export function statusFor(
  items: { quantity: Prisma.Decimal | number; receivedQuantity: Prisma.Decimal | number }[],
): PurchaseStatus {
  const anything = items.some((item) => Number(item.receivedQuantity) > 0);
  if (!anything) return PurchaseStatus.ORDERED;

  const everything = items.every(
    (item) => round3(Number(item.receivedQuantity)) >= round3(Number(item.quantity)),
  );
  return everything ? PurchaseStatus.RECEIVED : PurchaseStatus.PART_RECEIVED;
}

/** The purchases one view covers. */
export function purchaseFilter(query: {
  status?: PurchaseStatus;
  vendorId?: string;
  search?: string;
}): Prisma.PurchaseWhereInput {
  const search = query.search?.trim();
  const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.vendorId ? { vendorId: query.vendorId } : {}),
    ...(search
      ? {
          OR: [
            { code: contains(search) },
            { billNumber: contains(search) },
            { vendor: { name: contains(search) } },
          ],
        }
      : {}),
  };
}
