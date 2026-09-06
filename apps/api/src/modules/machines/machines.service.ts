import { Injectable, NotFoundException } from '@nestjs/common';
import { MachineState, MachineStatus, JobStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateMachineDto, UpdateMachineStatusDto } from './dto/machine.dto';

/** Machine status and the run log are two views of the same fact, so they are
 *  always written together: the current status is the open log row. */
const STATE_FOR_STATUS: Record<MachineStatus, MachineState> = {
  IDLE: MachineState.IDLE,
  SETUP: MachineState.SETUP,
  RUNNING: MachineState.RUNNING,
  PAUSED: MachineState.IDLE,
  MAINTENANCE: MachineState.DOWN,
  BREAKDOWN: MachineState.DOWN,
  OFFLINE: MachineState.DOWN,
};

@Injectable()
export class MachinesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.machine.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      include: {
        materials: { include: { category: { select: { code: true, name: true } } } },
        _count: { select: { jobs: true } },
      },
    });
  }

  async findOne(id: string) {
    const machine = await this.prisma.machine.findUnique({
      where: { id },
      include: {
        materials: { include: { category: true } },
        tools: { where: { isActive: true } },
        jobs: {
          where: { status: { in: [JobStatus.QUEUED, JobStatus.SETUP, JobStatus.RUNNING, JobStatus.PAUSED] } },
          orderBy: { sequence: 'asc' },
          include: { material: { select: { code: true, name: true } } },
        },
      },
    });
    if (!machine) throw new NotFoundException(`Machine ${id} not found`);
    return machine;
  }

  create(dto: CreateMachineDto) {
    return this.prisma.machine.create({ data: dto });
  }

  /** Closes the open run-log row and opens the next one. */
  async setStatus(id: string, dto: UpdateMachineStatusDto, userId?: string) {
    const machine = await this.prisma.machine.findUnique({ where: { id } });
    if (!machine) throw new NotFoundException(`Machine ${id} not found`);
    if (machine.status === dto.status) return machine;

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const open = await tx.machineRunLog.findFirst({
        where: { machineId: id, endedAt: null },
        orderBy: { startedAt: 'desc' },
      });

      if (open) {
        await tx.machineRunLog.update({
          where: { id: open.id },
          data: {
            endedAt: now,
            durationMinutes: Math.max(
              Math.round((now.getTime() - open.startedAt.getTime()) / 60000),
              0,
            ),
          },
        });
      }

      await tx.machineRunLog.create({
        data: {
          machineId: id,
          state: STATE_FOR_STATUS[dto.status],
          startedAt: now,
          downtimeReasonId: dto.downtimeReasonId,
          operatorId: userId,
          note: dto.note,
        },
      });

      return tx.machine.update({ where: { id }, data: { status: dto.status } });
    });
  }

  /** Live board for the shop floor: what each machine is doing right now. */
  async board() {
    const machines = await this.prisma.machine.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      include: {
        jobs: {
          where: {
            status: {
              in: [JobStatus.QUEUED, JobStatus.SETUP, JobStatus.RUNNING, JobStatus.PAUSED],
            },
          },
          orderBy: [{ status: 'asc' }, { sequence: 'asc' }],
          take: 10,
          include: {
            material: { select: { code: true, name: true } },
            order: { select: { code: true, dueDate: true } },
            operator: { select: { id: true, name: true } },
          },
        },
      },
    });

    return machines.map((machine) => {
      const running = machine.jobs.find((j) => j.status === JobStatus.RUNNING);
      return {
        id: machine.id,
        code: machine.code,
        name: machine.name,
        type: machine.type,
        status: machine.status,
        currentJob: running ?? null,
        queueLength: machine.jobs.filter((j) => j.status === JobStatus.QUEUED).length,
        queue: machine.jobs,
      };
    });
  }

  listDowntimeReasons() {
    return this.prisma.downtimeReason.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }
}
