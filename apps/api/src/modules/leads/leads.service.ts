import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomFieldEntity,
  EstimateStatus,
  Prisma,
  StatusCategory,
  TaxTreatment,
  UserRole,
  WorkflowKind,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { amountInWords } from '../../common/utils/pricing';
import { firmProfileOrCreate } from '../../common/documents/firm-profile';
import { NotificationsService } from '../notifications/notifications.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';
import { paginate } from '../../common/dto/pagination.dto';
import { OrdersService } from '../orders/orders.service';
import { CustomFieldsService } from './custom-fields.service';
import { pricedFromQuote } from '../estimates/estimate-pricing';
import {
  priceQuoteLine,
  quoteTotals,
  type PricedQuoteLine,
} from '../../common/pricing/quote-lines';
import {
  ChangeLeadStatusDto,
  ConvertLeadDto,
  CreateLeadDto,
  LeadItemDto,
  LeadQueryDto,
  LeadSourceDto,
  UpdateLeadDto,
} from './dto/lead.dto';
import { tenantId } from '../../common/tenancy/tenant-context';
import { PERMISSIONS } from '@fas/shared';

/** How many cards one board column carries before it says "and N more". */
const BOARD_COLUMN_LIMIT = 20;

const LEAD_INCLUDE = {
  /* In the order they were written, which is the order they were discussed. */
  items: { orderBy: { lineNo: 'asc' as const } },
  client: {
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      /* Which side of a state line the client is on, so a printed enquiry
         shows CGST and SGST or a single IGST line rather than guessing. */
      stateCode: true,
    },
  },
  source: { select: { id: true, code: true, name: true, color: true } },
  status: { select: { id: true, code: true, name: true, color: true, category: true } },
  owner: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  convertedOrder: { select: { id: true, code: true } },
  /* What has actually been quoted for this enquiry, newest first. */
  estimates: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      code: true,
      status: true,
      grandTotal: true,
      issuedOn: true,
      validTill: true,
      orderId: true,
      /*
       * Who the quote was written for, and what it became. An enquiry and its
       * quote are two doors into the same job: without these the lead cannot
       * tell that its own quote has already made the order, or that it already
       * has a client of its own.
       */
      clientId: true,
    },
  },
};

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodeGeneratorService,
    private readonly customFields: CustomFieldsService,
    private readonly orders: OrdersService,
    private readonly notifications: NotificationsService,
  ) {}

  // -- sources --------------------------------------------------------------

  listSources(includeInactive = false) {
    return this.prisma.leadSource.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  createSource(dto: LeadSourceDto) {
    return this.prisma.leadSource.create({ data: { ...dto, tenantId: tenantId() } });
  }

  // -- leads ----------------------------------------------------------------

  async list(query: LeadQueryDto) {
    const quiet = await this.quietCutoff();

    const where: Prisma.LeadWhereInput = {
      ...(quiet ? (query.archived ? goneQuiet(quiet) : stillLive(quiet)) : {}),
      ...(query.statusId ? { statusId: query.statusId } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.sourceId ? { sourceId: query.sourceId } : {}),
      ...(query.converted === undefined
        ? {}
        : query.converted
          ? { convertedOrderId: { not: null } }
          : { convertedOrderId: null }),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' as const } },
              { title: { contains: query.search, mode: 'insensitive' as const } },
              { contactName: { contains: query.search, mode: 'insensitive' as const } },
              { contactPhone: { contains: query.search } },
              { company: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        include: LEAD_INCLUDE,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  async findOne(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        ...LEAD_INCLUDE,
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
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);
    return lead;
  }

  async create(dto: CreateLeadDto, userId?: string) {
    const workflow = await this.resolveWorkflow(dto.workflowId);
    const initial = workflow.statuses.find((status) => status.isInitial);
    if (!initial) {
      throw new BadRequestException(
        `Lead pipeline "${workflow.name}" has no starting status. Mark one on the flow builder.`,
      );
    }

    if (!dto.clientId && !dto.contactName && !dto.contactPhone) {
      throw new BadRequestException(
        'A lead needs either an existing client or a contact name or phone',
      );
    }

    const customFields = await this.customFields.coerce(
      CustomFieldEntity.LEAD,
      dto.customFields,
    );
    const code = await this.codes.next('lead');

    const treatment = dto.taxTreatment ?? TaxTreatment.EXCLUSIVE;
    const priced = await this.priceItems(dto.items ?? [], treatment);
    const totals = await this.itemTotals(priced, dto.clientId);

    return this.prisma.lead.create({
      data: {
        tenantId: tenantId(),
        code,
        title: dto.title,
        clientId: dto.clientId,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        contactEmail: dto.contactEmail,
        company: dto.company,
        location: dto.location,
        sourceId: dto.sourceId,
        workflowId: workflow.id,
        statusId: initial.id,
        ownerId: dto.ownerId ?? userId,
        priority: dto.priority,
        /*
         * The typed guess wins where there is one, and the priced lines stand
         * in for it where there is not. The two are not the same thing — a
         * guess is what somebody thought the job was worth with the phone
         * still warm, and the lines are what it was actually priced at — but
         * the pipeline has to add up to something, and an enquiry priced line
         * by line that reports no value at all is worse than either.
         */
        estimatedValue: dto.estimatedValue ?? (priced.length ? totals.grandTotal : undefined),
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        notes: dto.notes,
        taxTreatment: treatment,
        ...totals,
        customFields: customFields as Prisma.InputJsonValue,
        createdById: userId,
        items: {
          create: priced.map((line, index) => ({
            tenantId: tenantId(),
            lineNo: index + 1,
            ...line,
          })),
        },
        statusHistory: {
          create: {
            tenantId: tenantId(),
            toStatusId: initial.id,
            changedById: userId,
            note: 'Lead created',
          },
        },
      },
      include: LEAD_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateLeadDto) {
    const lead = await this.findOne(id);

    // Merge rather than replace: a form that shows a subset of fields must not
    // wipe the ones it did not render.
    const merged = {
      ...(lead.customFields as Record<string, unknown>),
      ...(dto.customFields ?? {}),
    };
    const customFields = await this.customFields.coerce(CustomFieldEntity.LEAD, merged, {
      partial: true,
    });

    /*
     * Lines are only touched when the caller sent some. A screen that shows
     * the contact details and not the pricing must not wipe the pricing on
     * save — the same reason customFields are merged above rather than
     * replaced. Sending an empty array is how lines are cleared, because that
     * is somebody saying "no lines" rather than a form staying quiet.
     */
    const repricing = dto.items !== undefined || dto.taxTreatment !== undefined;
    const treatment = dto.taxTreatment ?? lead.taxTreatment;
    const priced = repricing
      ? await this.priceItems(dto.items ?? asItemDtos(lead.items ?? []), treatment)
      : [];
    const totals = repricing
      ? await this.itemTotals(priced, dto.clientId ?? lead.clientId ?? undefined)
      : null;

    return this.prisma.$transaction(async (tx) => {
      if (repricing) {
        // Replaced rather than reconciled, as a quotation's are: matching a
        // revised set up by position silently mis-edits the line somebody
        // deleted from the middle.
        await tx.leadItem.deleteMany({ where: { leadId: id } });
      }

      return tx.lead.update({
        where: { id },
        data: {
          title: dto.title,
          clientId: dto.clientId,
          contactName: dto.contactName,
          contactPhone: dto.contactPhone,
          contactEmail: dto.contactEmail,
          company: dto.company,
          location: dto.location,
          sourceId: dto.sourceId,
          ownerId: dto.ownerId,
          priority: dto.priority,
          estimatedValue: dto.estimatedValue,
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
          notes: dto.notes,
          customFields: customFields as Prisma.InputJsonValue,
          ...(repricing && totals
            ? {
                taxTreatment: treatment,
                ...totals,
                items: {
                  create: priced.map((line, index) => ({
                    tenantId: tenantId(),
                    lineNo: index + 1,
                    ...line,
                  })),
                },
              }
            : {}),
        },
        include: LEAD_INCLUDE,
      });
    });
  }

  /**
   * Everything the printable enquiry needs, assembled in one place.
   *
   * Assembled here rather than in the renderer for the reason Quotes does it:
   * the app and the paper must show the same figures, and a total that differs
   * between the screen and the sheet is the one bug nobody forgives.
   */
  async forPrinting(id: string) {
    const [lead, firm] = await Promise.all([
      this.findOne(id),
      firmProfileOrCreate(this.prisma),
    ]);

    return {
      lead,
      firm,
      amountInWords: amountInWords(Number(lead.grandTotal)),
      terms: firm.termsAndConditions ?? '',
      interState: Number(lead.igst) > 0,
    };
  }

  // -- pricing an enquiry ---------------------------------------------------

  /**
   * The enquiry's lines, priced.
   *
   * Exactly what Quotes does to its own, through the same function, because
   * the shop prices the job on the phone and quotes it later and the two have
   * to come to the same money. The slab is resolved here, per line, and the
   * arithmetic is not ours.
   */
  private async priceItems(
    items: LeadItemDto[],
    treatment: TaxTreatment,
  ): Promise<PricedQuoteLine[]> {
    if (items.length === 0) return [];

    const defaultSlab = await this.prisma.gstSlab.findFirst({
      where: { isDefault: true, isActive: true },
    });

    return Promise.all(
      items.map(async (item) => {
        const slab = item.gstSlabId
          ? await this.prisma.gstSlab.findFirst({ where: { id: item.gstSlabId } })
          : defaultSlab;

        return priceQuoteLine(
          item,
          { id: slab?.id ?? null, ratePct: slab ? Number(slab.ratePct) : 0 },
          treatment,
        );
      }),
    );
  }

  /**
   * What the priced lines add up to, split the way the two states decide.
   *
   * The firm's own state code is read rather than required: a shop that has
   * not filled in its profile yet is treated as selling locally, which is the
   * documented fallback and the overwhelmingly common case.
   */
  private async itemTotals(priced: PricedQuoteLine[], clientId?: string) {
    const [firm, client] = await Promise.all([
      this.prisma.firmProfile.findFirst({ select: { stateCode: true } }),
      clientId
        ? this.prisma.client.findFirst({ where: { id: clientId }, select: { stateCode: true } })
        : null,
    ]);

    const { savedAmount: _savedAmount, ...totals } = quoteTotals(
      priced,
      firm?.stateCode,
      client?.stateCode,
    );
    return totals;
  }

  /** Same rule as orders: only moves drawn on the canvas are allowed. */
  async changeStatus(
    id: string,
    dto: ChangeLeadStatusDto,
    user?: { id: string; role?: string; permissions?: string[] },
  ) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: { status: true },
    });
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);
    if (lead.statusId === dto.toStatusId) return this.findOne(id);

    const transition = await this.prisma.workflowTransition.findUnique({
      where: {
        workflowId_fromStatusId_toStatusId: {
          workflowId: lead.workflowId,
          fromStatusId: lead.statusId,
          toStatusId: dto.toStatusId,
        },
      },
      include: { toStatus: true },
    });

    if (!transition) {
      return this.moveBack(lead, dto, user);
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

    return this.applyStatus(lead, dto, user, false);
  }

  /**
   * Sending an enquiry back a stage.
   *
   * The same rule orders have: the move must exist on the canvas the other way
   * round, the person must be allowed to make it, and the caller must say so
   * deliberately. An enquiry that was quoted and is being talked about again
   * is the case this is for.
   */
  private async moveBack(
    lead: { id: string; statusId: string; workflowId: string; status: { name: string } },
    dto: ChangeLeadStatusDto,
    user?: { id: string; role?: string; permissions?: string[] },
  ) {
    const target = await this.prisma.workflowStatus.findUnique({
      where: { id: dto.toStatusId },
    });

    const backwards = await this.prisma.workflowTransition.findUnique({
      where: {
        workflowId_fromStatusId_toStatusId: {
          workflowId: lead.workflowId,
          fromStatusId: dto.toStatusId,
          toStatusId: lead.statusId,
        },
      },
    });

    if (!backwards) {
      throw new BadRequestException(
        `The pipeline does not allow moving from ${lead.status.name} to ${target?.name ?? 'that stage'}`,
      );
    }

    if (!user?.permissions?.includes(PERMISSIONS.LEAD_MOVE_BACK)) {
      throw new ForbiddenException(
        `Going back from ${lead.status.name} to ${target?.name ?? 'that stage'} is not a move the pipeline draws. Only somebody allowed to send enquiries back can do it.`,
      );
    }

    if (!dto.reverse) {
      throw new BadRequestException(
        `${lead.status.name} → ${target?.name ?? 'that stage'} is a move back, not part of the usual journey. Confirm it before it is made.`,
      );
    }

    return this.applyStatus(lead, dto, user, true);
  }

  private async applyStatus(
    lead: { id: string; statusId: string },
    dto: ChangeLeadStatusDto,
    user: { id: string; name?: string; code?: string } | undefined,
    reversed: boolean,
  ) {
    await this.prisma.$transaction([
      this.prisma.lead.update({ where: { id: lead.id }, data: { statusId: dto.toStatusId } }),
      this.prisma.leadStatusHistory.create({
        data: {
          tenantId: tenantId(),
          leadId: lead.id,
          fromStatusId: lead.statusId,
          toStatusId: dto.toStatusId,
          note: dto.note,
          reversed,
          changedById: user?.id,
        },
      }),
    ]);

    const fresh = await this.findOne(lead.id);

    // After the move: the move is the point, the notification is the courtesy.
    await this.notifications.raise('lead.moved', {
      entity: 'Lead',
      entityId: lead.id,
      actorId: user?.id,
      values: {
        lead: fresh.code ?? fresh.title,
        stage: fresh.status?.name,
        who: user?.name ?? user?.code,
      },
    });

    return fresh;
  }

  /**
   * Turn a lead into an order.
   *
   * The lead is kept and linked rather than consumed, so the pipeline can still
   * answer how many enquiries became work. If the lead only ever had loose
   * contact details, those become a real client here — that is the moment the
   * shop commits to them.
   */
  async convert(id: string, dto: ConvertLeadDto, user?: { id: string; role?: string }) {
    const lead = await this.findOne(id);

    if (lead.convertedOrderId) {
      throw new BadRequestException(
        `${lead.code} was already converted into ${lead.convertedOrder?.code}`,
      );
    }
    /*
     * The other door into the same job.
     *
     * A quote carries its enquiry, and turning the quote into an order is the
     * same act as turning the enquiry into one. Each route used to guard only
     * its own row, so doing both made two orders for one job — the shop's
     * books showed ₹86,400 for ₹43,200 of work, with nothing anywhere saying
     * the second order was the first one again.
     */
    const already = lead.estimates?.find((estimate) => estimate.orderId);
    if (already) {
      // Looked up only to refuse, so the shop is told the number to go and
      // find rather than that something unspecified already happened.
      const made = await this.prisma.order.findFirst({
        where: { id: already.orderId ?? '' },
        select: { code: true },
      });
      throw new BadRequestException(
        `${lead.code} is already an order — ${already.code} became ${made?.code ?? 'an order'}`,
      );
    }
    if (!dto.items?.length) {
      throw new BadRequestException('Converting a lead needs at least one item');
    }

    /*
     * Who this is for, if anybody already knows.
     *
     * The enquiry's own client first, then whoever its quote was written for.
     * Falling straight through to the contact details made a second record for
     * somebody the quote had already put on the books — and the phone-number
     * match could not save it, because the client made from the quote screen
     * had no phone on it to match against.
     */
    /*
     * What the client already agreed to pay.
     *
     * Converting from the quote carried its figure across; converting from the
     * enquiry punched an order with no price on it at all, so the shop typed
     * ₹43,200 again by hand — the same job, the same figure, and one keystroke
     * from a number nobody agreed to. The items the person just entered are
     * kept, because those are the sizes the floor will cut; only the money
     * comes from the quote.
     *
     * A declined or expired quote is not an agreement, so it prices nothing.
     */
    const standing = await this.standingQuote(lead.estimates ?? []);
    const priced = standing ? pricedFromQuote(standing) : {};

    const knownClientId =
      lead.clientId ?? lead.estimates?.find((estimate) => estimate.clientId)?.clientId ?? undefined;

    const order = await this.orders.punch(
      {
        clientId: knownClientId,
        newClient: knownClientId
          ? undefined
          : {
              name: lead.contactName || lead.company || lead.title,
              phone: lead.contactPhone ?? undefined,
              email: lead.contactEmail ?? undefined,
              company: lead.company ?? undefined,
            },
        location: dto.location,
        workflowId: dto.workflowId,
        priority: dto.priority ?? lead.priority,
        dueDate: dto.dueDate,
        notes: dto.notes ?? `Converted from lead ${lead.code}`,
        ...priced,
        items: dto.items,
      } as never,
      user?.id,
    );

    /*
     * The quote the money came from becomes that order's quotation, exactly as
     * it would have if its own button had been pressed. Otherwise it sits at
     * SENT for ever, against a job that has been in production for a month.
     */
    if (standing) {
      await this.prisma.estimate.update({
        where: { id: standing.id },
        data: { status: EstimateStatus.CONVERTED, orderId: order.id },
      });
    }

    // Park the lead on a closed stage so it leaves the active pipeline. Prefer
    // an explicit choice, else any DONE stage, else leave it where it is.
    const closingStatusId =
      dto.convertedStatusId ??
      (
        await this.prisma.workflowStatus.findFirst({
          where: { workflowId: lead.workflowId, category: StatusCategory.DONE },
          orderBy: { sortOrder: 'asc' },
          select: { id: true },
        })
      )?.id;

    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id },
        data: {
          convertedOrderId: order.id,
          convertedAt: new Date(),
          /*
           * The enquiry keeps the client the order landed on, whether it was
           * already known or has just been created. Without this the lead
           * stayed client-less after the very act of committing to somebody,
           * and every later screen had to guess from the loose contact fields
           * which of two records it meant.
           */
          ...(order.clientId ? { clientId: order.clientId } : {}),
          ...(closingStatusId ? { statusId: closingStatusId } : {}),
        },
      });

      if (closingStatusId && closingStatusId !== lead.statusId) {
        await tx.leadStatusHistory.create({
          data: {
            tenantId: tenantId(),
            leadId: id,
            fromStatusId: lead.statusId,
            toStatusId: closingStatusId,
            note: `Converted into ${order.code}`,
            changedById: user?.id,
          },
        });
      }
    });

    return { lead: await this.findOne(id), order };
  }

  /** Pipeline view: leads grouped under the stages the admin configured. */
  async board(workflowId?: string) {
    const workflow = await this.resolveWorkflow(workflowId);
    const quiet = cutoffFrom(workflow.leadExpiryDays);

    // Capped per column, like the order board, and each column fetched on its
    // own so a busy stage cannot starve the rest. The value is the whole
    // column's — a pipeline figure that moved with how many cards happened to
    // be loaded would be worthless.
    const ordered = workflow.statuses
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const columns = await Promise.all(
      ordered.map(async (status) => {
        // An enquiry that has gone quiet is off the board — it lives in the
        // archive until somebody touches it again.
        const where = {
          workflowId: workflow.id,
          statusId: status.id,
          ...(quiet ? stillLive(quiet) : {}),
        };
        /*
         * What the column is worth: the quoted figure where a quote went out,
         * the guess where none has. Two aggregates rather than one because
         * that is a coalesce, and summing both columns outright would count
         * the leads that have been quoted twice over.
         */
        const [leads, stats, quoted] = await Promise.all([
          this.prisma.lead.findMany({
            where,
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
            include: LEAD_INCLUDE,
            take: BOARD_COLUMN_LIMIT,
          }),
          this.prisma.lead.aggregate({
            where: { ...where, quotedValue: null },
            _count: { _all: true },
            _sum: { estimatedValue: true },
          }),
          this.prisma.lead.aggregate({
            where: { ...where, quotedValue: { not: null } },
            _count: { _all: true },
            _sum: { quotedValue: true },
          }),
        ]);
        return {
          status,
          leads,
          total: stats._count._all + quoted._count._all,
          value:
            Number(stats._sum.estimatedValue ?? 0) + Number(quoted._sum.quotedValue ?? 0),
        };
      }),
    );

    return {
      workflow: { id: workflow.id, code: workflow.code, name: workflow.name },
      columns,
    };
  }

  /**
   * The moment before which an untouched enquiry counts as gone quiet.
   *
   * Worked out on the way past rather than stamped on the row by a nightly job:
   * there is nothing to run, nothing to fall behind, and the moment somebody
   * touches a quiet lead it is live again because the clock is its own
   * `updatedAt`.
   */
  /**
   * The quotation an enquiry is converted at, if one still stands.
   *
   * Newest first, and only one the client could still say yes to: a declined
   * or expired quote is not an agreement, and pricing a job at one would put a
   * figure on the books that nobody accepted. Fetched rather than read off the
   * lead's own summary because the money needs the treatment and the slab, and
   * the summary carries neither.
   */
  private async standingQuote(
    quotes: { id: string; status: string; orderId: string | null }[],
  ) {
    const candidate = quotes.find(
      (quote) =>
        !quote.orderId &&
        quote.status !== EstimateStatus.DECLINED &&
        quote.status !== EstimateStatus.EXPIRED,
    );
    if (!candidate) return null;

    return this.prisma.estimate.findFirst({
      where: { id: candidate.id },
      select: {
        id: true,
        code: true,
        taxTreatment: true,
        total: true,
        grandTotal: true,
        items: { select: { gstSlabId: true } },
      },
    });
  }

  private async quietCutoff(): Promise<Date | null> {
    const workflow = await this.prisma.workflow.findFirst({
      where: { kind: WorkflowKind.LEAD, isDefault: true, isActive: true },
    });
    return cutoffFrom(workflow?.leadExpiryDays);
  }

  private async resolveWorkflow(workflowId?: string) {
    const workflow = workflowId
      ? await this.prisma.workflow.findUnique({
          where: { id: workflowId },
          include: { statuses: true },
        })
      : await this.prisma.workflow.findFirst({
          where: { kind: WorkflowKind.LEAD, isDefault: true, isActive: true },
          include: { statuses: true },
        });

    if (!workflow) {
      throw new NotFoundException(
        'No lead pipeline is configured — an admin must create one on the flow builder',
      );
    }
    return workflow;
  }
}

/** Days into a moment. Zero and null both mean nothing ever goes quiet. */
function cutoffFrom(days?: number | null): Date | null {
  if (!days || days <= 0) return null;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

/**
 * An enquiry nobody has touched since the cutoff, and that has not already
 * finished. A won lead is not stale, it is done; a lost one has been dealt
 * with, and a stage the shop marked terminal is the shop saying so.
 */
function goneQuiet(cutoff: Date): Prisma.LeadWhereInput {
  return {
    updatedAt: { lt: cutoff },
    convertedOrderId: null,
    status: { isTerminal: false },
  };
}

/** Everything else — what the list and the board show. */
function stillLive(cutoff: Date): Prisma.LeadWhereInput {
  return {
    NOT: {
      updatedAt: { lt: cutoff },
      convertedOrderId: null,
      status: { isTerminal: false },
    },
  };
}

/**
 * Stored lines, back in the shape the pricer takes.
 *
 * Needed when only the treatment changed: the lines themselves are what they
 * were, but what each comes to is not, so they go through the same sum again
 * rather than having their stored figures adjusted in place.
 */
function asItemDtos(items: {
  name: string;
  description: string | null;
  hsnSac: string | null;
  quantity: unknown;
  unit: string;
  ratePerUnit: unknown;
  discountPct: unknown;
  gstSlabId: string | null;
}[]): LeadItemDto[] {
  return items.map((item) => ({
    name: item.name,
    description: item.description ?? undefined,
    hsnSac: item.hsnSac ?? undefined,
    quantity: Number(item.quantity),
    unit: item.unit,
    ratePerUnit: Number(item.ratePerUnit),
    discountPct: Number(item.discountPct),
    gstSlabId: item.gstSlabId ?? undefined,
  }));
}
