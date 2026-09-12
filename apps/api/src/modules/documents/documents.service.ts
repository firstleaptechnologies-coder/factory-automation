import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, Prisma, RateUnit } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';
import { tenantId } from '../../common/tenancy/tenant-context';
import { amountInWords, billableQuantity, round2 } from '../../common/utils/pricing';
import { dateOnly } from '../employees/employees.service';
import {
  CancelDto,
  ChallanDto,
  CreditNoteDto,
  DocumentQueryDto,
  RaiseInvoiceDto,
} from './dto/document.dto';
import {
  creditAmounts,
  invoiceLines,
  invoiceTotals,
  isInterState,
  receivable,
} from './invoice-maths';
import type { InvoiceLine } from './invoice-maths';

const INVOICE_INCLUDE = {
  items: { orderBy: { sortOrder: 'asc' as const } },
  order: { select: { id: true, code: true } },
  creditNotes: { where: { status: DocumentStatus.ISSUED }, orderBy: { issuedOn: 'asc' as const } },
} as const;

/**
 * The paper the shop gives people.
 *
 * None of it posts to the ledger, and that is the decision this module turns
 * on. An invoice is a claim, not a movement of money; the payment against it is
 * the movement, and that already posts. Posting both would count the same
 * rupees twice and leave the cash position — the figure this shop actually asks
 * about — wrong by everything it had billed and not been paid.
 *
 * Everything is snapshotted at the moment of issue. A document printed next
 * year has to be the one that went out, not a fresh render of whatever the
 * client's address and the shop's rates have become since.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodeGeneratorService,
  ) {}

  // -- invoices -------------------------------------------------------------

  invoices(query: DocumentQueryDto) {
    return this.prisma.invoice.findMany({
      where: documentFilter(query),
      orderBy: [{ issuedOn: 'desc' }, { code: 'desc' }],
      include: { order: { select: { id: true, code: true } } },
    });
  }

  async invoice(id: string) {
    const row = await this.prisma.invoice.findFirst({
      where: { id },
      include: INVOICE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Invoice not found');
    return row;
  }

  /** The invoice for one order, when it has been raised. */
  forOrder(orderId: string) {
    return this.prisma.invoice.findFirst({
      where: { orderId },
      include: INVOICE_INCLUDE,
    });
  }

  /**
   * Raises the invoice for an order.
   *
   * One per order. Progressive billing would mean deciding which lines belong
   * to which invoice, and this shop bills a job when it goes out — so a
   * correction is a credit note rather than a second invoice, which is what
   * the GST rules expect anyway.
   */
  async raise(orderId: string, dto: RaiseInvoiceDto, userId?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId },
      include: {
        client: true,
        items: {
          orderBy: { lineNo: 'asc' },
          include: {
            material: { select: { name: true } },
            materialThickness: { select: { valueMm: true, label: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    const already = await this.prisma.invoice.findFirst({ where: { orderId } });
    if (already) {
      throw new BadRequestException(
        `That order is already invoiced as ${already.code}. Raise a credit note to correct it.`,
      );
    }
    if (Number(order.grandTotal) <= 0) {
      throw new BadRequestException(
        'That order has no value yet — set the rates before invoicing it',
      );
    }

    const firm = await this.prisma.firmProfile.findFirst();
    const interState = isInterState(
      firm?.stateCode ? `${firm.stateCode}-${firm.stateName ?? ''}` : null,
      order.client.stateCode ? `${order.client.stateCode}-${order.client.stateName ?? ''}` : null,
    );

    /*
     * The money is the order's, restated. Most of this shop's work is quoted
     * as one figure for the whole job, which lives on the order and never on
     * its lines — an invoice that added its lines up would bill a
     * hundred-thousand-rupee job at zero.
     */
    const lines = invoiceLines(order.items.map(describeItem), {
      code: order.code,
      taxable: Number(order.total),
      tax: Number(order.taxAmount),
      discount: Number(order.discount),
    });
    const totals = invoiceTotals(
      {
        subtotal: Number(order.subtotal),
        discount: Number(order.discount),
        taxable: Number(order.total),
        tax: Number(order.taxAmount),
      },
      interState,
    );

    return this.prisma.invoice.create({
      data: {
        tenantId: tenantId(),
        code: await this.codes.next('invoice'),
        orderId,
        issuedOn: dto.issuedOn ? dateOnly(dto.issuedOn) : new Date(),
        dueOn: dto.dueOn ? dateOnly(dto.dueOn) : null,
        clientName: order.client.name,
        clientGstin: order.client.gstin,
        clientAddress: order.client.billingAddress ?? order.client.address,
        clientState: order.client.stateName
          ? `${order.client.stateCode ?? ''}-${order.client.stateName}`
          : null,
        firmName: firm?.name ?? '',
        firmGstin: firm?.gstin ?? null,
        firmState: firm?.stateName ? `${firm.stateCode ?? ''}-${firm.stateName}` : null,
        interState,
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxable: totals.taxable,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        total: totals.total,
        totalInWords: amountInWords(totals.total),
        terms: dto.terms?.trim() || null,
        note: dto.note?.trim() || null,
        issuedById: userId,
        items: {
          create: lines.map((line, index) => ({
            tenantId: tenantId(),
            description: line.description,
            hsn: line.hsn ?? null,
            quantity: line.quantity,
            unit: line.unit,
            rate: line.rate,
            amount: line.amount,
            discount: line.discount ?? 0,
            gstRatePct: line.gstRatePct,
            taxAmount: line.taxAmount,
            sortOrder: index,
          })),
        },
      },
      include: INVOICE_INCLUDE,
    });
  }

  /**
   * Voids an invoice, keeping its number.
   *
   * Never deleted. A gap in the series is the first thing an assessing officer
   * asks about, so the number stays used and the reason is the only record of
   * why the paper is worthless.
   */
  async cancelInvoice(id: string, dto: CancelDto) {
    const invoice = await this.invoice(id);
    if (invoice.status === DocumentStatus.CANCELLED) {
      throw new BadRequestException('That invoice is already cancelled');
    }
    if (invoice.creditNotes.length > 0) {
      throw new BadRequestException(
        'There are credit notes against that invoice. Cancel them first.',
      );
    }

    await this.prisma.invoice.update({
      where: { id },
      data: {
        status: DocumentStatus.CANCELLED,
        cancelReason: dto.reason.trim(),
        cancelledAt: new Date(),
      },
    });
    return this.invoice(id);
  }

  // -- challans -------------------------------------------------------------

  challans(query: DocumentQueryDto) {
    return this.prisma.challan.findMany({
      where: query.orderId ? { orderId: query.orderId } : {},
      orderBy: [{ issuedOn: 'desc' }],
      include: { items: { orderBy: { sortOrder: 'asc' } }, order: { select: { id: true, code: true } } },
    });
  }

  async challan(id: string) {
    const row = await this.prisma.challan.findFirst({
      where: { id },
      include: { items: { orderBy: { sortOrder: 'asc' } }, order: { select: { id: true, code: true } } },
    });
    if (!row) throw new NotFoundException('Challan not found');
    return row;
  }

  /**
   * A delivery challan for what is going out.
   *
   * More than one is allowed, unlike an invoice: a job often leaves in two
   * vans on two days, and each load needs its own paper travelling with it.
   */
  async issueChallan(orderId: string, dto: ChallanDto, userId?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId },
      include: {
        client: { select: { shippingAddress: true, address: true } },
        items: {
          orderBy: { lineNo: 'asc' },
          include: {
            material: { select: { name: true } },
            materialThickness: { select: { valueMm: true, label: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    return this.prisma.challan.create({
      data: {
        tenantId: tenantId(),
        code: await this.codes.next('challan'),
        orderId,
        issuedOn: dto.issuedOn ? dateOnly(dto.issuedOn) : new Date(),
        shipTo:
          dto.shipTo?.trim() ||
          order.client.shippingAddress ||
          order.client.address ||
          null,
        transport: dto.transport?.trim() || null,
        vehicle: dto.vehicle?.trim() || null,
        note: dto.note?.trim() || null,
        issuedById: userId,
        items: {
          create: order.items.map((item, index) => {
            const line = describeItem(item);
            return {
              tenantId: tenantId(),
              description: line.description,
              quantity: line.quantity,
              unit: line.unit,
              sortOrder: index,
            };
          }),
        },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } }, order: { select: { id: true, code: true } } },
    });
  }

  async cancelChallan(id: string, dto: CancelDto) {
    const challan = await this.challan(id);
    if (challan.status === DocumentStatus.CANCELLED) {
      throw new BadRequestException('That challan is already cancelled');
    }

    await this.prisma.challan.update({
      where: { id },
      data: {
        status: DocumentStatus.CANCELLED,
        cancelReason: dto.reason.trim(),
        cancelledAt: new Date(),
      },
    });
    return this.challan(id);
  }

  // -- credit notes ---------------------------------------------------------

  creditNotes(query: DocumentQueryDto) {
    return this.prisma.creditNote.findMany({
      where: {},
      orderBy: [{ issuedOn: 'desc' }],
      include: { invoice: { select: { id: true, code: true, clientName: true } } },
    });
  }

  async creditNote(id: string) {
    const row = await this.prisma.creditNote.findFirst({
      where: { id },
      include: { invoice: { select: { id: true, code: true, clientName: true, orderId: true } } },
    });
    if (!row) throw new NotFoundException('Credit note not found');
    return row;
  }

  /**
   * Credits part or all of an invoice.
   *
   * It reduces what the client owes and is never a payment. The GST comes off
   * in the proportion the invoice charged it, and the total credited can never
   * exceed what was billed — otherwise a credit note could turn a bill into
   * money owed to the client, which is a different document entirely.
   */
  async credit(invoiceId: string, dto: CreditNoteDto, userId?: string) {
    const invoice = await this.invoice(invoiceId);
    if (invoice.status === DocumentStatus.CANCELLED) {
      throw new BadRequestException('That invoice was cancelled — there is nothing to credit');
    }

    const alreadyCredited = round2(
      invoice.creditNotes.reduce((sum, note) => sum + Number(note.taxable), 0),
    );
    const room = round2(Number(invoice.taxable) - alreadyCredited);
    if (dto.taxable > room + 0.01) {
      throw new BadRequestException(
        `Only ₹${room.toFixed(2)} of that invoice is left to credit.`,
      );
    }

    const amounts = creditAmounts(dto.taxable, {
      taxable: Number(invoice.taxable),
      cgst: Number(invoice.cgst),
      sgst: Number(invoice.sgst),
      igst: Number(invoice.igst),
    });

    return this.prisma.creditNote.create({
      data: {
        tenantId: tenantId(),
        code: await this.codes.next('creditNote'),
        invoiceId,
        issuedOn: dto.issuedOn ? dateOnly(dto.issuedOn) : new Date(),
        reason: dto.reason,
        note: dto.note.trim(),
        taxable: amounts.taxable,
        cgst: amounts.cgst,
        sgst: amounts.sgst,
        igst: amounts.igst,
        total: amounts.total,
        totalInWords: amountInWords(amounts.total),
        issuedById: userId,
      },
      include: { invoice: { select: { id: true, code: true, clientName: true } } },
    });
  }

  async cancelCreditNote(id: string, dto: CancelDto) {
    const note = await this.creditNote(id);
    if (note.status === DocumentStatus.CANCELLED) {
      throw new BadRequestException('That credit note is already cancelled');
    }

    await this.prisma.creditNote.update({
      where: { id },
      data: {
        status: DocumentStatus.CANCELLED,
        cancelReason: dto.reason.trim(),
        cancelledAt: new Date(),
      },
    });
    return this.creditNote(id);
  }

  /**
   * What one order was charged, credited and paid.
   *
   * Three figures rather than one, on purpose. Credited money is never counted
   * as received: an order billed ₹50,000, credited ₹5,000 and paid ₹45,000 is
   * settled, and this says exactly that rather than showing ₹50,000 collected.
   */
  async receivableFor(orderId: string) {
    const [invoice, payments] = await Promise.all([
      this.prisma.invoice.findFirst({
        where: { orderId, status: DocumentStatus.ISSUED },
        include: { creditNotes: { where: { status: DocumentStatus.ISSUED } } },
      }),
      this.prisma.payment.aggregate({ where: { orderId }, _sum: { amount: true } }),
    ]);

    if (!invoice) return null;

    return {
      invoice: { id: invoice.id, code: invoice.code },
      ...receivable({
        invoiced: Number(invoice.total),
        credited: round2(
          invoice.creditNotes.reduce((sum, note) => sum + Number(note.total), 0),
        ),
        received: Number(payments._sum.amount ?? 0),
      }),
    };
  }
}

/**
 * One order line, as it should read on paper.
 *
 * The description is built here rather than stored on the item, because what a
 * client needs to see — the material, the size, the thickness — is spread
 * across three columns and a relation. Built once, then snapshotted onto the
 * document, so a material renamed next year does not restate an old invoice.
 */
export function describeItem(item: {
  lineNo?: number;
  material: { name: string };
  materialThickness?: { valueMm: Prisma.Decimal | number; label?: string | null } | null;
  lengthMm: Prisma.Decimal | number;
  widthMm: Prisma.Decimal | number;
  quantity: number;
  rate?: Prisma.Decimal | number | null;
  /** What the rate is per. Decides the quantity and unit the bill shows. */
  rateUnit?: RateUnit | null;
  amount: Prisma.Decimal | number;
  gstRatePct: Prisma.Decimal | number;
  taxAmount: Prisma.Decimal | number;
  notes?: string | null;
}): InvoiceLine {
  const thickness = item.materialThickness
    ? (item.materialThickness.label ?? `${Number(item.materialThickness.valueMm)}mm`)
    : null;
  // A lump-sum line often has no size at all — the shop priced the job, not the
  // panel. "0 × 0 mm" on a bill is worse than saying nothing.
  const size =
    Number(item.lengthMm) > 0 && Number(item.widthMm) > 0
      ? `${Number(item.lengthMm)} × ${Number(item.widthMm)} mm`
      : null;

  /*
   * The quantity the rate is actually charged on, not the piece count.
   *
   * A panel quoted at ₹200 per square foot billed "2.00 nos × ₹200.00 =
   * ₹20,000.00" — a line that does not multiply out, on the one document a
   * client's accountant reads closely. The billable figure is 100 sq ft, and
   * `billableQuantity` has existed for exactly this since the rates were
   * written.
   */
  const billable = billableQuantity({
    rate: Number(item.rate ?? 0),
    rateUnit: item.rateUnit ?? RateUnit.PER_PIECE,
    lengthMm: Number(item.lengthMm),
    widthMm: Number(item.widthMm),
    quantity: item.quantity,
  });

  return {
    description: [item.material.name, thickness, size, item.notes]
      .filter(Boolean)
      .join(' · '),
    hsn: null,
    quantity: billable.value,
    unit: billable.label,
    rate: Number(item.rate ?? 0),
    amount: Number(item.amount),
    gstRatePct: Number(item.gstRatePct),
    taxAmount: Number(item.taxAmount),
  };
}

/** The documents one view covers. */
export function documentFilter(query: {
  orderId?: string;
  from?: string;
  to?: string;
  search?: string;
}): Prisma.InvoiceWhereInput {
  const search = query.search?.trim();
  const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

  return {
    ...(query.orderId ? { orderId: query.orderId } : {}),
    ...(query.from || query.to
      ? {
          issuedOn: {
            ...(query.from ? { gte: dateOnly(query.from) } : {}),
            ...(query.to ? { lte: dateOnly(query.to) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { code: contains(search) },
            { clientName: contains(search) },
            { order: { code: contains(search) } },
          ],
        }
      : {}),
  };
}
