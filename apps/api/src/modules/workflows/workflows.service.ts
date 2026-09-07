import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatusCategory } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateWorkflowDto,
  SaveGraphDto,
  StatusDto,
  TransitionDto,
  UpdateStatusDto,
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

  async getDefault() {
    const workflow = await this.prisma.workflow.findFirst({
      where: { isDefault: true, isActive: true },
      include: {
        statuses: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
        transitions: true,
      },
    });
    if (!workflow) {
      throw new NotFoundException(
        'No default workflow is configured — an admin must create one before orders can be punched',
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
