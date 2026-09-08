import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomFieldEntity,
  Prisma,
  StatusCategory,
  UserRole,
  WorkflowKind,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';
import { paginate } from '../../common/dto/pagination.dto';
import { OrdersService } from '../orders/orders.service';
import { CustomFieldsService } from './custom-fields.service';
import {
  ChangeLeadStatusDto,
  ConvertLeadDto,
  CreateLeadDto,
  LeadQueryDto,
  LeadSourceDto,
  UpdateLeadDto,
} from './dto/lead.dto';
import { tenantId } from '../../common/tenancy/tenant-context';
import { PERMISSIONS } from '@decor/shared';

/** How many cards one board column carries before it says "and N more". */
const BOARD_COLUMN_LIMIT = 20;

const LEAD_INCLUDE = {
  client: { select: { id: true, code: true, name: true, phone: true } },
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
        estimatedValue: dto.estimatedValue,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        notes: dto.notes,
        customFields: customFields as Prisma.InputJsonValue,
        createdById: userId,
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

    return this.prisma.lead.update({
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
      },
      include: LEAD_INCLUDE,
    });
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
    user: { id: string } | undefined,
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

    return this.findOne(lead.id);
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
    if (!dto.items?.length) {
      throw new BadRequestException('Converting a lead needs at least one item');
    }

    const order = await this.orders.punch(
      {
        clientId: lead.clientId ?? undefined,
        newClient: lead.clientId
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
        items: dto.items,
      },
      user?.id,
    );

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
