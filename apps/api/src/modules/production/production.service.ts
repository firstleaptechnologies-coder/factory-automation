import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  JobStatus,
  MachineState,
  MachineStatus,
  OperationStatus,
  OperationType,
  OrderItemStatus,
  OrderStatus,
  Prisma,
  QcResult,
  WasteDisposition,
  WasteType,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';
import { paginate } from '../../common/dto/pagination.dto';
import {
  AssignJobDto,
  CreateJobDto,
  JobProgressDto,
  JobQueryDto,
  PauseJobDto,
  QualityCheckDto,
  ResequenceDto,
} from './dto/job.dto';

const DEFAULT_ROUTING: OperationType[] = [
  OperationType.CUT,
  OperationType.SANDING,
  OperationType.QC,
  OperationType.PACKING,
];

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodeGeneratorService,
  ) {}

  async list(query: JobQueryDto) {
    const where: Prisma.JobWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.machineId ? { machineId: query.machineId } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.operatorId ? { operatorId: query.operatorId } : {}),
      ...(query.search
        ? { code: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: [{ priority: 'desc' }, { sequence: 'asc' }, { createdAt: 'asc' }],
        include: {
          machine: { select: { id: true, code: true, name: true } },
          material: { select: { id: true, code: true, name: true } },
          operator: { select: { id: true, name: true } },
          order: {
            select: {
              id: true,
              code: true,
              dueDate: true,
              customer: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.job.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  async findOne(id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: {
        machine: true,
        material: { include: { category: true } },
        operator: { select: { id: true, name: true, code: true } },
        order: { include: { customer: { select: { id: true, name: true } } } },
        orderItem: true,
        nestPlan: { include: { parts: true } },
        operations: { orderBy: { seq: 'asc' }, include: { machine: true, operator: true } },
        materialIssues: { include: { stockUnit: { select: { id: true, code: true, areaSqm: true } } } },
        qualityChecks: { orderBy: { checkedAt: 'desc' } },
        wasteRecords: true,
        runLogs: { orderBy: { startedAt: 'desc' }, take: 50 },
      },
    });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  async create(dto: CreateJobDto) {
    const code = await this.codes.next('job');
    const routing = dto.operations?.length ? dto.operations : DEFAULT_ROUTING;

    const job = await this.prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          code,
          orderId: dto.orderId,
          orderItemId: dto.orderItemId,
          nestPlanId: dto.nestPlanId,
          machineId: dto.machineId,
          materialId: dto.materialId,
          quantity: dto.quantity,
          priority: dto.priority,
          plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : undefined,
          plannedEnd: dto.plannedEnd ? new Date(dto.plannedEnd) : undefined,
          estimatedMinutes: dto.estimatedMinutes,
          notes: dto.notes,
          status: dto.machineId ? JobStatus.QUEUED : JobStatus.PLANNED,
          sequence: dto.machineId ? await this.nextSequence(tx, dto.machineId) : 0,
          operations: {
            create: routing.map((type, index) => ({ seq: index + 1, type })),
          },
        },
        include: { operations: true },
      });

      if (dto.orderItemId) {
        await tx.orderItem.update({
          where: { id: dto.orderItemId },
          data: { status: OrderItemStatus.PLANNED },
        });
      }
      return created;
    });

    return job;
  }

  private async nextSequence(
    tx: Prisma.TransactionClient,
    machineId: string,
  ): Promise<number> {
    const last = await tx.job.findFirst({
      where: {
        machineId,
        status: { in: [JobStatus.QUEUED, JobStatus.SETUP, JobStatus.RUNNING, JobStatus.PAUSED] },
      },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    return (last?.sequence ?? 0) + 1;
  }

  async assign(id: string, dto: AssignJobDto) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    if (job.status === JobStatus.COMPLETED || job.status === JobStatus.CANCELLED) {
      throw new BadRequestException(`Job ${job.code} is ${job.status}`);
    }

    const machine = await this.prisma.machine.findUnique({
      where: { id: dto.machineId },
      include: { materials: true },
    });
    if (!machine) throw new NotFoundException('Machine not found');

    const material = await this.prisma.material.findUnique({
      where: { id: job.materialId },
      select: { categoryId: true, name: true },
    });
    const capable = machine.materials.some((m) => m.categoryId === material?.categoryId);
    if (machine.materials.length > 0 && !capable) {
      throw new BadRequestException(
        `${machine.name} is not set up to cut ${material?.name}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      return tx.job.update({
        where: { id },
        data: {
          machineId: dto.machineId,
          operatorId: dto.operatorId,
          sequence: dto.sequence ?? (await this.nextSequence(tx, dto.machineId)),
          status: job.status === JobStatus.PLANNED ? JobStatus.QUEUED : job.status,
        },
        include: { machine: true },
      });
    });
  }

  /** Drag-and-drop reordering of a machine's queue. */
  async resequence(dto: ResequenceDto) {
    return this.prisma.$transaction(
      dto.jobIds.map((jobId, index) =>
        this.prisma.job.update({
          where: { id: jobId },
          data: { sequence: index + 1, machineId: dto.machineId },
        }),
      ),
    );
  }

  /**
   * Operator hits Start. Opens a RUNNING run-log slice on the machine, flips the
   * machine's status, and stamps the job's first actual start — the number that
   * later exposes the gap between planned and real cycle time.
   */
  async start(id: string, userId?: string) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    if (!job.machineId) {
      throw new BadRequestException('Assign the job to a machine before starting it');
    }
    if (job.status === JobStatus.RUNNING) return job;
    const terminal: JobStatus[] = [JobStatus.COMPLETED, JobStatus.CANCELLED];
    if (terminal.includes(job.status)) {
      throw new BadRequestException(`Job ${job.code} is ${job.status}`);
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await this.closeOpenRunLog(tx, job.machineId!, now);

      await tx.machineRunLog.create({
        data: {
          machineId: job.machineId!,
          jobId: job.id,
          state: MachineState.RUNNING,
          startedAt: now,
          operatorId: userId ?? job.operatorId,
        },
      });

      await tx.machine.update({
        where: { id: job.machineId! },
        data: { status: MachineStatus.RUNNING },
      });

      const firstPending = await tx.jobOperation.findFirst({
        where: { jobId: id, status: OperationStatus.PENDING },
        orderBy: { seq: 'asc' },
      });
      if (firstPending) {
        await tx.jobOperation.update({
          where: { id: firstPending.id },
          data: {
            status: OperationStatus.IN_PROGRESS,
            startedAt: now,
            operatorId: userId,
            machineId: job.machineId,
          },
        });
      }

      if (job.orderId) {
        await tx.order.updateMany({
          where: { id: job.orderId, status: OrderStatus.CONFIRMED },
          data: { status: OrderStatus.IN_PRODUCTION },
        });
        await tx.orderItem.updateMany({
          where: { id: job.orderItemId ?? '' },
          data: { status: OrderItemStatus.IN_PRODUCTION },
        });
      }

      return tx.job.update({
        where: { id },
        data: {
          status: JobStatus.RUNNING,
          actualStart: job.actualStart ?? now,
          operatorId: userId ?? job.operatorId,
        },
      });
    });
  }

  async pause(id: string, dto: PauseJobDto, userId?: string) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    if (job.status !== JobStatus.RUNNING) {
      throw new BadRequestException(`Job ${job.code} is not running`);
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await this.closeOpenRunLog(tx, job.machineId!, now);

      await tx.machineRunLog.create({
        data: {
          machineId: job.machineId!,
          jobId: job.id,
          state: dto.downtimeReasonId ? MachineState.DOWN : MachineState.IDLE,
          startedAt: now,
          downtimeReasonId: dto.downtimeReasonId,
          operatorId: userId,
          note: dto.note,
        },
      });

      await tx.machine.update({
        where: { id: job.machineId! },
        data: {
          status: dto.downtimeReasonId ? MachineStatus.BREAKDOWN : MachineStatus.IDLE,
        },
      });

      return tx.job.update({ where: { id }, data: { status: JobStatus.PAUSED } });
    });
  }

  async progress(id: string, dto: JobProgressDto) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found`);

    return this.prisma.job.update({
      where: { id },
      data: {
        completedQty: dto.completedQty ?? job.completedQty,
        rejectedQty: dto.rejectedQty ?? job.rejectedQty,
        notes: dto.note ?? job.notes,
      },
    });
  }

  /**
   * Finish the job: close the run log, roll actual minutes up from the log
   * slices, advance the order line, and free the machine.
   */
  async complete(id: string, userId?: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: { operations: true },
    });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    if (job.status === JobStatus.COMPLETED) return job;

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      if (job.machineId) {
        await this.closeOpenRunLog(tx, job.machineId, now);
        await tx.machine.update({
          where: { id: job.machineId },
          data: { status: MachineStatus.IDLE },
        });
      }

      await tx.jobOperation.updateMany({
        where: { jobId: id, status: { not: OperationStatus.COMPLETED } },
        data: { status: OperationStatus.COMPLETED, endedAt: now },
      });

      const runTotal = await tx.machineRunLog.aggregate({
        where: { jobId: id, state: MachineState.RUNNING },
        _sum: { durationMinutes: true },
      });

      const completed = await tx.job.update({
        where: { id },
        data: {
          status: JobStatus.COMPLETED,
          actualEnd: now,
          actualMinutes: runTotal._sum.durationMinutes ?? job.actualMinutes,
          completedQty: job.completedQty.gt(0) ? job.completedQty : job.quantity,
        },
      });

      if (job.orderItemId) {
        const orderItem = await tx.orderItem.update({
          where: { id: job.orderItemId },
          data: {
            producedQty: { increment: completed.completedQty },
            status: OrderItemStatus.COMPLETED,
          },
        });

        const remaining = await tx.orderItem.count({
          where: {
            orderId: orderItem.orderId,
            status: { notIn: [OrderItemStatus.COMPLETED, OrderItemStatus.CANCELLED] },
          },
        });
        if (remaining === 0) {
          await tx.order.updateMany({
            where: { id: orderItem.orderId, status: OrderStatus.IN_PRODUCTION },
            data: { status: OrderStatus.READY },
          });
        }
      }

      return completed;
    });
  }

  async recordQualityCheck(id: string, dto: QualityCheckDto, userId?: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: { materialIssues: { include: { stockUnit: true } } },
    });
    if (!job) throw new NotFoundException(`Job ${id} not found`);

    const qtyRejected = dto.qtyRejected ?? Math.max(dto.qtyChecked - dto.qtyPassed, 0);

    return this.prisma.$transaction(async (tx) => {
      const check = await tx.qualityCheck.create({
        data: {
          jobId: id,
          result: dto.result,
          qtyChecked: dto.qtyChecked,
          qtyPassed: dto.qtyPassed,
          qtyRejected,
          reasonId: dto.reasonId,
          checkedById: userId,
          remarks: dto.remarks,
        },
      });

      if (qtyRejected > 0) {
        // A rejection is material that was paid for and cut but cannot ship —
        // it belongs in the waste ledger, not just the QC log.
        await tx.wasteRecord.create({
          data: {
            materialId: job.materialId,
            jobId: id,
            type: WasteType.REJECTION,
            disposition:
              dto.result === QcResult.REWORK
                ? WasteDisposition.REUSE
                : WasteDisposition.PENDING,
            quantity: qtyRejected,
            isReusable: dto.result === QcResult.REWORK,
            reasonId: dto.reasonId,
            recordedById: userId,
            remarks: dto.remarks,
          },
        });

        await tx.job.update({
          where: { id },
          data: { rejectedQty: { increment: qtyRejected } },
        });
      }

      return check;
    });
  }

  private async closeOpenRunLog(
    tx: Prisma.TransactionClient,
    machineId: string,
    at: Date,
  ) {
    const open = await tx.machineRunLog.findFirst({
      where: { machineId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!open) return;

    await tx.machineRunLog.update({
      where: { id: open.id },
      data: {
        endedAt: at,
        durationMinutes: Math.max(
          Math.round((at.getTime() - open.startedAt.getTime()) / 60000),
          0,
        ),
      },
    });
  }

  /** The operator's screen: everything queued or running on their machine. */
  async myQueue(operatorId: string) {
    return this.prisma.job.findMany({
      where: {
        status: { in: [JobStatus.QUEUED, JobStatus.SETUP, JobStatus.RUNNING, JobStatus.PAUSED] },
        OR: [{ operatorId }, { operatorId: null }],
      },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { sequence: 'asc' }],
      include: {
        machine: { select: { id: true, code: true, name: true } },
        material: { select: { code: true, name: true } },
        order: { select: { code: true, dueDate: true, customer: { select: { name: true } } } },
        nestPlan: { select: { id: true, code: true, utilizationPct: true } },
      },
    });
  }
}
