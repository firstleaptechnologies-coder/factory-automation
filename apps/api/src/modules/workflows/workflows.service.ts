import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatusCategory, WorkflowKind } from '@prisma/client';
import { HOME_CARD_LIMIT } from '@decor/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateWorkflowDto,
  SaveGraphDto,
  StatusDto,
  TransitionDto,
  UpdateStatusDto,
  UpdateWorkflowDto,
} from './dto/workflow.dto';
import { tenantId } from '../../common/tenancy/tenant-context';

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.workflow.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { statuses: true, transitions: true, orders: true } },
      },
    });
  }

  /** The full graph: nodes with their hierarchy and saved canvas positions, plus edges. */
  async findOne(id: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id },
      include: {
        statuses: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: { _count: { select: { ordersAtStatus: true } } },
        },
        transitions: true,
      },
    });
    if (!workflow) throw new NotFoundException(`Workflow ${id} not found`);
    return workflow;
  }

  /**
   * The flow orders run on.
   *
   * Asked for by kind, not by `isDefault` alone: a shop has a default order
   * flow and a default lead pipeline, and whichever row came back first would
   * otherwise decide whether the orders list filtered by order stages or by
   * enquiry stages.
   */
  async getDefault(kind: WorkflowKind = WorkflowKind.ORDER) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { kind, isDefault: true, isActive: true },
      include: {
        statuses: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          // Carried here so the home screen's summary costs no extra call.
          include: { _count: { select: { ordersAtStatus: true } } },
        },
        transitions: true,
      },
    });
    if (!workflow) {
      throw new NotFoundException(
        `No default ${kind.toLowerCase()} workflow is configured — an admin must create one first`,
      );
    }
    return workflow;
  }

  async create(dto: CreateWorkflowDto) {
    const isFirst = (await this.prisma.workflow.count()) === 0;
    return this.prisma.workflow.create({
      data: { ...dto, tenantId: tenantId(), isDefault: isFirst },
      include: { statuses: true, transitions: true },
    });
  }

  /**
   * Rename a flow, say how long an enquiry may sit before it goes quiet, or
   * name the stage that means a quote has gone out.
   */
  async update(id: string, dto: UpdateWorkflowDto) {
    const workflow = await this.findOne(id);

    if (dto.quoteStatusId) {
      const known = workflow.statuses.some((status) => status.id === dto.quoteStatusId);
      if (!known) {
        throw new BadRequestException('That stage does not belong to this flow');
      }
    }

    return this.prisma.workflow.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        // Zero reads as "never", which is how it is turned off.
        ...(dto.leadExpiryDays !== undefined
          ? { leadExpiryDays: dto.leadExpiryDays ? dto.leadExpiryDays : null }
          : {}),
        ...(dto.quoteStatusId !== undefined
          ? { quoteStatusId: dto.quoteStatusId || null }
          : {}),
      },
    });
  }

  async setDefault(id: string) {
    await this.findOne(id);
    // Exactly one default, so clear the rest in the same transaction.
    return this.prisma.$transaction(async (tx) => {
      await tx.workflow.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
      return tx.workflow.update({ where: { id }, data: { isDefault: true } });
    });
  }

  // -- statuses -------------------------------------------------------------

  async addStatus(workflowId: string, dto: StatusDto) {
    await this.findOne(workflowId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isInitial) await this.clearInitial(tx, workflowId);
      return tx.workflowStatus.create({
        data: {
          tenantId: tenantId(),
          workflowId,
          code: dto.code,
          name: dto.name,
          color: dto.color ?? '#6B7785',
          category: dto.category ?? StatusCategory.OPEN,
          parentId: dto.parentId ?? null,
          isInitial: dto.isInitial ?? false,
          isTerminal: dto.isTerminal ?? false,
          sortOrder: dto.sortOrder ?? 0,
          canvasX: dto.canvasX ?? 0,
          canvasY: dto.canvasY ?? 0,
        },
      });
    });
  }

  async updateStatus(id: string, dto: UpdateStatusDto) {
    const status = await this.prisma.workflowStatus.findUnique({ where: { id } });
    if (!status) throw new NotFoundException(`Status ${id} not found`);

    if (dto.parentId) {
      await this.assertNoCycle(id, dto.parentId);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isInitial) await this.clearInitial(tx, status.workflowId, id);
      return tx.workflowStatus.update({
        where: { id },
        data: {
          code: dto.code,
          name: dto.name,
          color: dto.color,
          category: dto.category,
          parentId: dto.parentId === undefined ? undefined : dto.parentId,
          isInitial: dto.isInitial,
          isTerminal: dto.isTerminal,
          sortOrder: dto.sortOrder,
          canvasX: dto.canvasX,
          canvasY: dto.canvasY,
        },
      });
    });
  }

  /**
   * A status holding orders cannot be removed — those orders would point at
   * nothing. The admin has to move them first, and the error says so.
   */
  async removeStatus(id: string) {
    const status = await this.prisma.workflowStatus.findUnique({
      where: { id },
      include: { _count: { select: { ordersAtStatus: true, children: true } } },
    });
    if (!status) throw new NotFoundException(`Status ${id} not found`);

    if (status._count.ordersAtStatus > 0) {
      throw new BadRequestException(
        `${status.name} still holds ${status._count.ordersAtStatus} order(s). Move them to another status first.`,
      );
    }
    if (status._count.children > 0) {
      throw new BadRequestException(
        `${status.name} has sub-statuses. Remove or re-parent them first.`,
      );
    }

    return this.prisma.workflowStatus.delete({ where: { id } });
  }

  // -- graph ----------------------------------------------------------------

  /**
   * Persist the canvas: node positions and the complete set of edges.
   *
   * Transitions are replaced wholesale inside one transaction, so the saved
   * flow always matches the diagram the admin was looking at.
   */
  async saveGraph(workflowId: string, dto: SaveGraphDto) {
    const workflow = await this.findOne(workflowId);
    const statusIds = new Set(workflow.statuses.map((s) => s.id));

    for (const transition of dto.transitions) {
      if (!statusIds.has(transition.fromStatusId) || !statusIds.has(transition.toStatusId)) {
        throw new BadRequestException(
          'A transition refers to a status that is not part of this workflow',
        );
      }
      if (transition.fromStatusId === transition.toStatusId) {
        throw new BadRequestException('A status cannot transition to itself');
      }
    }

    const deduped = dedupeTransitions(dto.transitions);

    return this.prisma.$transaction(async (tx) => {
      for (const position of dto.positions) {
        if (!statusIds.has(position.id)) continue;
        await tx.workflowStatus.update({
          where: { id: position.id },
          data: { canvasX: position.canvasX, canvasY: position.canvasY },
        });
      }

      await tx.workflowTransition.deleteMany({ where: { workflowId } });
      if (deduped.length) {
        await tx.workflowTransition.createMany({
          data: deduped.map((transition) => ({
            tenantId: tenantId(),
            workflowId,
            fromStatusId: transition.fromStatusId,
            toStatusId: transition.toStatusId,
            label: transition.label,
            requiresNote: transition.requiresNote ?? false,
            allowedRoles: transition.allowedRoles ?? [],
          })),
        });
      }

      return tx.workflow.findUnique({
        where: { id: workflowId },
        include: { statuses: true, transitions: true },
      });
    });
  }

  /**
   * Which stages the home screen counts, and in what order.
   *
   * Written as a set rather than one stage at a time: the order is the whole
   * point, and a half-applied change would leave two stages claiming the same
   * position on the card.
   */
  async setHomeCard(workflowId: string, statusIds: string[]) {
    const workflow = await this.findOne(workflowId);
    const known = new Set(workflow.statuses.map((status) => status.id));

    for (const id of statusIds) {
      if (!known.has(id)) {
        throw new BadRequestException('A stage does not belong to this workflow');
      }
    }
    if (new Set(statusIds).size !== statusIds.length) {
      throw new BadRequestException('A stage can only appear once on the card');
    }
    if (statusIds.length > HOME_CARD_LIMIT) {
      throw new BadRequestException(
        `The home card holds ${HOME_CARD_LIMIT} stages; ${statusIds.length} were chosen`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.workflowStatus.updateMany({
        where: { workflowId, homeCardOrder: { not: null } },
        data: { homeCardOrder: null },
      });
      for (const [position, id] of statusIds.entries()) {
        await tx.workflowStatus.update({
          where: { id },
          data: { homeCardOrder: position },
        });
      }
      return tx.workflow.findUnique({
        where: { id: workflowId },
        include: {
          statuses: {
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            include: { _count: { select: { ordersAtStatus: true } } },
          },
          transitions: true,
        },
      });
    });
  }

  /**
   * Where a status can be sent back to.
   *
   * The edges of the flow are one-way on purpose. Work does go backwards
   * though — a piece fails QC, a client changes an approved design — and the
   * honest way to allow that is to let it walk back along an arrow that exists
   * rather than to draw a permanent backwards one anybody could take by
   * accident. So the moves back are exactly the moves in, reversed.
   */
  async allowedBack(statusId: string) {
    const incoming = await this.prisma.workflowTransition.findMany({
      where: { toStatusId: statusId },
      include: {
        fromStatus: {
          select: { id: true, code: true, name: true, color: true, category: true },
        },
      },
    });
    return incoming.map((transition) => ({
      transitionId: transition.id,
      toStatus: transition.fromStatus,
    }));
  }

  /** Moves available from a status, for the order screen's status dropdown. */
  async allowedNext(statusId: string) {
    return this.prisma.workflowTransition.findMany({
      where: { fromStatusId: statusId },
      include: {
        toStatus: { select: { id: true, code: true, name: true, color: true, category: true } },
      },
    });
  }

  private async clearInitial(
    tx: Prisma.TransactionClient,
    workflowId: string,
    exceptId?: string,
  ) {
    await tx.workflowStatus.updateMany({
      where: { workflowId, isInitial: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isInitial: false },
    });
  }

  /**
   * Walk up the parent chain before re-parenting. Without this an admin can
   * make A the parent of B while B is already an ancestor of A, and every
   * later tree render recurses forever.
   */
  private async assertNoCycle(statusId: string, newParentId: string): Promise<void> {
    if (statusId === newParentId) {
      throw new BadRequestException('A status cannot be its own parent');
    }

    let cursor: string | null = newParentId;
    const seen = new Set<string>([statusId]);

    while (cursor) {
      if (seen.has(cursor)) {
        throw new BadRequestException('That would create a loop in the status hierarchy');
      }
      seen.add(cursor);

      const parent: { parentId: string | null } | null =
        await this.prisma.workflowStatus.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
      cursor = parent?.parentId ?? null;
    }
  }
}

/** The canvas can emit the same edge twice; the table has a unique index on it. */
function dedupeTransitions(transitions: TransitionDto[]): TransitionDto[] {
  const byPair = new Map<string, TransitionDto>();
  for (const transition of transitions) {
    byPair.set(`${transition.fromStatusId}->${transition.toStatusId}`, transition);
  }
  return [...byPair.values()];
}
