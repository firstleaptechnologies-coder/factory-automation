import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EstimateStatus,
  PricingMode,
  Prisma,
  StatusCategory,
  TaxTreatment,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';
import { tenantId } from '../../common/tenancy/tenant-context';
import { OrdersService } from '../orders/orders.service';
import { paginate } from '../../common/dto/pagination.dto';
import { amountInWords, round2, splitTax } from '../../common/utils/pricing';
import { estimateTotals } from './estimate-totals';
import {
  CreateEstimateDto,
  EstimateItemDto,
  EstimateQueryDto,
  FirmProfileDto,
  UpdateEstimateDto,
} from './dto/estimate.dto';

/** Ours, until a tenant picks their own. */
const DEFAULT_ACCENT = '#FF6B1A';

const INCLUDE = {
  client: true,
  items: { orderBy: { lineNo: 'asc' as const } },
  createdBy: { select: { id: true, name: true } },
  lead: {
    select: {
      id: true,
      code: true,
      title: true,
      statusId: true,
      workflowId: true,
      convertedOrderId: true,
      status: { select: { id: true, name: true, color: true } },
    },
  },
};

/** Quotes that count as the live figure for an enquiry. */
const LIVE_QUOTE: EstimateStatus[] = [
  EstimateStatus.SENT,
  EstimateStatus.ACCEPTED,
  EstimateStatus.CONVERTED,
];

/**
 * Quotations, and the firm's own details that get printed on them.
 *
 * An estimate is written before anything is measured, so its lines are free
 * text rather than materials and size presets — forcing a quote through the
 * punch form would make it slower to give than writing it out by hand. What it
 * shares with an order is the money: the same GST slabs, the same treatment,
 * the same arithmetic.
 */
@Injectable()
export class EstimatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodeGeneratorService,
    private readonly orders: OrdersService,
    private readonly notifications: NotificationsService,
  ) {}

  // -- the firm's own letterhead details ------------------------------------

  async firmProfile() {
    const profile = await this.prisma.firmProfile.findFirst();
    if (profile) return profile;

    // A tenant that has never filled this in still has to be able to print, so
    // the row is created on first read rather than being a missing-record error
    // on the way to a PDF.
    return this.prisma.firmProfile.create({
      data: { tenantId: tenantId(), name: 'Your firm' },
    });
  }

  /** Just the colours, for every signed-in user regardless of role. */
  async theme(): Promise<{ accent: string }> {
    const profile = await this.prisma.firmProfile.findFirst({
      select: { themeAccent: true },
    });
    return { accent: profile?.themeAccent ?? DEFAULT_ACCENT };
  }

  async saveFirmProfile(dto: FirmProfileDto) {
    await this.firmProfile();
    return this.prisma.firmProfile.update({
      where: { tenantId: tenantId() },
      data: dto,
    });
  }

  async setLetterhead(fileId: string | null, kind: 'letterhead' | 'logo') {
    await this.firmProfile();
    return this.prisma.firmProfile.update({
      where: { tenantId: tenantId() },
      data: kind === 'logo' ? { logoFileId: fileId } : { letterheadFileId: fileId },
    });
  }

  // -- estimates ------------------------------------------------------------

  async list(query: EstimateQueryDto) {
    const where: Prisma.EstimateWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' as const } },
              { clientName: { contains: query.search, mode: 'insensitive' as const } },
              { client: { name: { contains: query.search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.estimate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
        include: INCLUDE,
      }),
      this.prisma.estimate.count({ where }),
    ]);

    return paginate(rows, total, { page: query.page, limit: query.limit });
  }

  async findOne(id: string) {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id },
      include: INCLUDE,
    });
    if (!estimate) throw new NotFoundException(`Estimate ${id} not found`);
    return estimate;
  }

  async create(dto: CreateEstimateDto, userId?: string) {
    const code = await this.codes.next('estimate');
    const priced = await this.priceLines(dto.items, dto.taxTreatment ?? TaxTreatment.EXCLUSIVE);
    const client = dto.clientId
      ? await this.prisma.client.findFirst({ where: { id: dto.clientId } })
      : null;
    const firm = await this.firmProfile();

    const totals = estimateTotals(priced, firm.stateCode, client?.stateCode);

    const estimate = await this.prisma.estimate.create({
      data: {
        tenantId: tenantId(),
        code,
        clientId: dto.clientId,
        clientName: dto.clientName ?? client?.name,
        leadId: dto.leadId ? (await this.assertLead(dto.leadId)).id : undefined,
        // Snapshotted: an estimate reprinted next year must show the address it
        // was actually sent to, not wherever the client has moved since.
        billingAddress: dto.billingAddress ?? client?.billingAddress ?? client?.address,
        shippingAddress: dto.shippingAddress ?? client?.shippingAddress,
        clientGstin: client?.gstin,
        clientStateCode: client?.stateCode,
        validTill: dto.validTill ? new Date(dto.validTill) : undefined,
        notes: dto.notes,
        termsOverride: dto.termsOverride,
        taxTreatment: dto.taxTreatment ?? TaxTreatment.EXCLUSIVE,
        ...totals,
        createdById: userId,
        items: {
          create: priced.map((line, index) => ({
            tenantId: tenantId(),
            lineNo: index + 1,
            ...line,
          })),
        },
      },
      include: INCLUDE,
    });

    // Writing a quote is work on the enquiry: it must not go quiet underneath.
    if (estimate?.leadId) await this.touchLead(estimate.leadId);

    return estimate;
  }

  async update(id: string, dto: UpdateEstimateDto) {
    const existing = await this.findOne(id);
    const treatment = dto.taxTreatment ?? existing.taxTreatment;
    const priced = await this.priceLines(dto.items, treatment);
    const client = dto.clientId
      ? await this.prisma.client.findFirst({ where: { id: dto.clientId } })
      : existing.client;
    const firm = await this.firmProfile();

    const totals = estimateTotals(priced, firm.stateCode, client?.stateCode);

    return this.prisma.$transaction(async (tx) => {
      // Lines are replaced rather than reconciled: a revised quote is a new set
      // of numbers, and matching them up by position would silently mis-edit a
      // line that was deleted from the middle.
      await tx.estimateItem.deleteMany({ where: { estimateId: id } });

      return tx.estimate.update({
        where: { id },
        data: {
          clientId: dto.clientId ?? existing.clientId,
          clientName: dto.clientName ?? existing.clientName,
          leadId: dto.leadId ?? existing.leadId,
          billingAddress: dto.billingAddress ?? existing.billingAddress,
          shippingAddress: dto.shippingAddress ?? existing.shippingAddress,
          validTill: dto.validTill ? new Date(dto.validTill) : existing.validTill,
          notes: dto.notes ?? existing.notes,
          termsOverride: dto.termsOverride ?? existing.termsOverride,
          status: dto.status ?? existing.status,
          taxTreatment: treatment,
          ...totals,
          items: {
            create: priced.map((line, index) => ({
              tenantId: tenantId(),
              lineNo: index + 1,
              ...line,
            })),
          },
        },
        include: INCLUDE,
      });
    }).then(async (saved) => {
      // A revised quote is a new figure for the enquiry it belongs to.
      if (saved?.leadId) await this.settleLead(saved.leadId);
      return saved;
    });
  }

  /**
   * Where a quotation is in its life, and what that means for the enquiry.
   *
   * Sending one is the moment the pipeline is supposed to move: the stage is
   * the shop's own — configured on the lead flow, because one shop's pipeline
   * says "Quoted" and the next says "Estimate sent" — and the move is made
   * through the same graph everything else obeys, so a pipeline that does not
   * allow it simply does not move.
   */
  async setStatus(id: string, status: EstimateStatus, userId?: string) {
    const before = await this.findOne(id);
    const estimate = await this.prisma.estimate.update({
      where: { id },
      data: { status },
      include: INCLUDE,
    });

    if (estimate?.leadId) {
      await this.settleLead(estimate.leadId);
      if (status === EstimateStatus.SENT && before.status !== EstimateStatus.SENT) {
        await this.markLeadQuoted(estimate.leadId, estimate.code, userId);
      }
      if (status === EstimateStatus.DECLINED && before.status !== EstimateStatus.DECLINED) {
        await this.markLeadLost(estimate.leadId, estimate.code, userId);
      }
    }

    /*
     * A client's answer, which is the one thing on a quote nobody wants to
     * hear about a week late.
     */
    if (status !== before.status && (status === EstimateStatus.ACCEPTED || status === EstimateStatus.DECLINED)) {
      await this.notifications.raise(
        status === EstimateStatus.ACCEPTED ? 'quote.accepted' : 'quote.declined',
        {
          entity: 'Estimate',
          entityId: id,
          actorId: userId,
          values: {
            quote: estimate.code,
            client: estimate.client?.name ?? estimate.clientName,
            amount: `₹${Number(estimate.grandTotal).toFixed(2)}`,
          },
        },
      );
    }

    return estimate;
  }

  async remove(id: string) {
    const estimate = await this.findOne(id);
    const removed = await this.prisma.estimate.delete({ where: { id } });
    // The enquiry's quoted figure came from this; it cannot outlive it.
    if (estimate.leadId) await this.settleLead(estimate.leadId);
    return removed;
  }

  /**
   * Turn an accepted quotation into a real order.
   *
   * The estimate is kept rather than consumed: it is the record of what was
   * quoted and agreed, and an order that later gets edited must not silently
   * rewrite that history. The money carries across exactly — the client agreed
   * to these figures, so re-deriving them from today's rates would be wrong.
   *
   * Estimate lines are free text, so they become a single lump-sum order rather
   * than being forced into materials and sizes nobody measured. The floor
   * prices the real lines when the job is actually specified.
   */
  async convertToOrder(
    id: string,
    dto: { location: string; workflowId?: string; startStatusId?: string; notes?: string },
    userId?: string,
  ) {
    const estimate = await this.findOne(id);

    if (estimate.orderId) {
      throw new BadRequestException(
        `${estimate.code} has already been turned into an order`,
      );
    }
    if (!estimate.clientId) {
      throw new BadRequestException(
        'Attach this estimate to a client before turning it into an order',
      );
    }

    const order = await this.orders.punch(
      {
        clientId: estimate.clientId,
        location: dto.location,
        workflowId: dto.workflowId,
        startStatusId: dto.startStatusId,
        notes: dto.notes ?? `From estimate ${estimate.code}`,
        pricingMode: PricingMode.LUMP_SUM,
        taxTreatment: estimate.taxTreatment,
        /*
         * The figure the treatment expects, so the order comes to exactly what
         * was quoted.
         *
         * A lump-sum order under EXCLUSIVE reads its figure as the taxable
         * value and adds GST on top; handing it the gross therefore taxed a
         * figure that already included tax, and a client who agreed to
         * ₹4,25,980 was invoiced ₹5,02,656. Under INCLUSIVE and ABSORBED the
         * quoted figure is what they pay and the tax comes out of it, which is
         * the gross.
         */
        total:
          estimate.taxTreatment === TaxTreatment.EXCLUSIVE
            ? Number(estimate.total)
            : Number(estimate.grandTotal),
        // The slab the quote was priced at, where it was all one slab. The
        // shop's default is not necessarily the rate the client agreed to.
        gstSlabId: oneSlab(estimate.items),
        items: [
          {
            // One line standing for the whole quotation. Its own price is left
            // off: under LUMP_SUM the order total is the agreed figure and a
            // per-line rate would be a number nobody quoted.
            materialId: await this.anyMaterialId(),
            length: { value: 0, unit: 'MM' },
            width: { value: 0, unit: 'MM' },
            quantity: 1,
            notes: estimate.items.map((item) => item.name).join(', ').slice(0, 400),
          },
        ],
      } as never,
      userId,
    );

    await this.prisma.estimate.update({
      where: { id },
      data: { status: EstimateStatus.CONVERTED, orderId: order.id },
    });

    /*
     * The enquiry became work too.
     *
     * A lead quoted properly, accepted and turned into an order through this
     * path showed in the funnel as never converted, because only the estimate
     * knew about the order. The pipeline is meant to answer how many enquiries
     * became work, so it has to be told.
     */
    if (estimate.leadId) await this.convertLead(estimate.leadId, order, userId);

    return order;
  }

  /** Mark the enquiry converted and park it on a closed stage, as a direct
   *  conversion from the lead screen would. */
  private async convertLead(
    leadId: string,
    order: { id: string; code: string },
    userId?: string,
  ) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId },
      select: { id: true, statusId: true, workflowId: true, convertedOrderId: true },
    });
    // Already work: whatever it became, that is the record.
    if (!lead || lead.convertedOrderId) return;

    const closing = await this.prisma.workflowStatus.findFirst({
      where: { workflowId: lead.workflowId, category: StatusCategory.DONE },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: leadId },
        data: {
          convertedOrderId: order.id,
          convertedAt: new Date(),
          ...(closing ? { statusId: closing.id } : {}),
        },
      });
      if (closing && closing.id !== lead.statusId) {
        await tx.leadStatusHistory.create({
          data: {
            tenantId: tenantId(),
            leadId,
            fromStatusId: lead.statusId,
            toStatusId: closing.id,
            note: `Converted into ${order.code}`,
            changedById: userId,
          },
        });
      }
    });
  }

  // -- the enquiry a quote belongs to ---------------------------------------

  private async assertLead(leadId: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId } });
    if (!lead) throw new NotFoundException(`Lead ${leadId} not found`);
    return lead;
  }

  /**
   * Touch the enquiry so it does not go quiet.
   *
   * A lead is archived on `updatedAt`, and quoting is unmistakably work on it —
   * without this, writing a careful estimate for somebody was exactly the
   * activity that let their enquiry fall off the board.
   */
  private async touchLead(leadId: string) {
    await this.prisma.lead.update({ where: { id: leadId }, data: {} });
  }

  /**
   * What the enquiry is worth, taken from the quote that was actually sent.
   *
   * Written onto the lead rather than derived on read: the board sums whole
   * columns, and a figure it cannot sum is a figure it cannot show. The guess
   * typed when the enquiry was taken stays where it is — the difference
   * between the two is worth being able to see.
   */
  private async settleLead(leadId: string) {
    const live = await this.prisma.estimate.findFirst({
      where: { leadId, status: { in: LIVE_QUOTE } },
      orderBy: { updatedAt: 'desc' },
      select: { grandTotal: true },
    });
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { quotedValue: live ? live.grandTotal : null },
    });
  }

  /**
   * Move the enquiry to the stage that means "quoted", if the shop has named
   * one and the pipeline allows the move from where the lead stands.
   *
   * Deliberately quiet about failure: a quote that went out is a fact, and
   * refusing to record it because a pipeline is drawn a particular way would
   * be the tail wagging the dog.
   */
  private async markLeadQuoted(leadId: string, estimateCode: string, userId?: string) {
    await this.moveLead(leadId, 'quoteStatusId', `Quote ${estimateCode} sent`, userId);
  }

  /**
   * The client said no.
   *
   * Which stage that means is the shop's own: one pipeline says "Lost", another
   * says "Closed — no", and a third keeps declined enquiries where they are and
   * works them again. So it is configured, and an unset stage moves nothing.
   */
  private async markLeadLost(leadId: string, estimateCode: string, userId?: string) {
    await this.moveLead(leadId, 'lostStatusId', `Quote ${estimateCode} declined`, userId);
  }

  /**
   * Move an enquiry to one of its pipeline's configured stages.
   *
   * Through the same graph everything else obeys: a pipeline with no arrow from
   * where the enquiry is to where this would put it simply does not move, which
   * is the shop's drawing being respected rather than worked around.
   */
  private async moveLead(
    leadId: string,
    stage: 'quoteStatusId' | 'lostStatusId',
    note: string,
    userId?: string,
  ) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId },
      select: { id: true, statusId: true, workflowId: true },
    });
    if (!lead) return;

    const workflow = await this.prisma.workflow.findFirst({
      where: { id: lead.workflowId },
      select: { quoteStatusId: true, lostStatusId: true },
    });
    const target = workflow?.[stage];
    if (!target || target === lead.statusId) return;

    const allowed = await this.prisma.workflowTransition.findUnique({
      where: {
        workflowId_fromStatusId_toStatusId: {
          workflowId: lead.workflowId,
          fromStatusId: lead.statusId,
          toStatusId: target,
        },
      },
    });
    if (!allowed) return;

    await this.prisma.$transaction([
      this.prisma.lead.update({ where: { id: leadId }, data: { statusId: target } }),
      this.prisma.leadStatusHistory.create({
        data: {
          tenantId: tenantId(),
          leadId,
          fromStatusId: lead.statusId,
          toStatusId: target,
          note,
          changedById: userId,
        },
      }),
    ]);
  }

  /** A lump-sum stand-in line still needs a material to point at. */
  private async anyMaterialId(): Promise<string> {
    const material = await this.prisma.material.findFirst({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (!material) {
      throw new BadRequestException(
        'Add at least one material before turning an estimate into an order',
      );
    }
    return material.id;
  }

  /**
   * Everything a printed estimate needs, in one object.
   *
   * Assembled here rather than in the renderer so the app and the PDF show the
   * same figures — a total that differs between the screen and the paper is the
   * one bug nobody forgives.
   */
  async forPrinting(id: string) {
    const [estimate, firm] = await Promise.all([this.findOne(id), this.firmProfile()]);

    return {
      estimate,
      firm,
      amountInWords: amountInWords(Number(estimate.grandTotal)),
      terms: estimate.termsOverride ?? firm.termsAndConditions ?? '',
      interState: Boolean(Number(estimate.igst) > 0),
    };
  }

  // -- arithmetic -----------------------------------------------------------

  private async priceLines(items: EstimateItemDto[], treatment: TaxTreatment) {
    const defaultSlab = await this.prisma.gstSlab.findFirst({
      where: { isDefault: true, isActive: true },
    });

    return Promise.all(
      items.map(async (item) => {
        const slab = item.gstSlabId
          ? await this.prisma.gstSlab.findFirst({ where: { id: item.gstSlabId } })
          : defaultSlab;
        const gstRatePct = slab ? Number(slab.ratePct) : 0;

        const gross = round2(item.quantity * item.ratePerUnit);
        const discountPct = item.discountPct ?? 0;
        const discountAmount = round2((gross * discountPct) / 100);
        const afterDiscount = round2(gross - discountAmount);

        // The line discount comes off before the tax split, so the client is
        // taxed on what they are actually being charged.
        const split = splitTax(afterDiscount, gstRatePct, treatment);

        return {
          name: item.name,
          description: item.description,
          hsnSac: item.hsnSac,
          quantity: item.quantity,
          unit: item.unit ?? 'Sqf',
          ratePerUnit: item.ratePerUnit,
          discountPct,
          discountAmount,
          gstSlabId: slab?.id ?? null,
          gstRatePct,
          taxAmount: split.tax,
          netAmount: split.net,
          amount: split.gross,
        };
      }),
    );
  }

}

/** The slab every line shares, or nothing if the quote mixed rates. */
function oneSlab(items: { gstSlabId: string | null }[]): string | undefined {
  const slabs = new Set(items.map((item) => item.gstSlabId));
  const [only] = [...slabs];
  return slabs.size === 1 && only ? only : undefined;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
