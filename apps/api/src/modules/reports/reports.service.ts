import { Injectable } from '@nestjs/common';
import {
  JobStatus,
  MachineState,
  OrderStatus,
  StockUnitKind,
  StockUnitStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { round } from '../../common/utils/geometry';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Single call that fills the home screen on web and mobile. */
  async dashboard() {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      openOrders,
      overdueOrders,
      jobsByStatus,
      machines,
      completedToday,
      wasteThisMonth,
      offcutStock,
    ] = await Promise.all([
      this.prisma.order.count({
        where: {
          status: {
            in: [OrderStatus.CONFIRMED, OrderStatus.IN_PRODUCTION, OrderStatus.READY],
          },
        },
      }),
      this.prisma.order.count({
        where: {
          dueDate: { lt: startOfDay },
          status: {
            in: [OrderStatus.CONFIRMED, OrderStatus.IN_PRODUCTION, OrderStatus.READY],
          },
        },
      }),
      this.prisma.job.groupBy({
        by: ['status'],
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.machine.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, status: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.job.count({
        where: { status: JobStatus.COMPLETED, actualEnd: { gte: startOfDay } },
      }),
      this.prisma.wasteRecord.aggregate({
        where: { recordedAt: { gte: monthStart } },
        _sum: { areaSqm: true, costImpact: true },
      }),
      this.prisma.stockUnit.aggregate({
        where: { kind: StockUnitKind.OFFCUT, status: StockUnitStatus.AVAILABLE },
        _count: { _all: true },
        _sum: { areaSqm: true, purchaseCost: true },
      }),
    ]);

    return {
      orders: { open: openOrders, overdue: overdueOrders },
      jobs: Object.fromEntries(jobsByStatus.map((j) => [j.status, j._count._all])),
      jobsCompletedToday: completedToday,
      machines,
      wasteThisMonth: {
        areaSqm: round(Number(wasteThisMonth._sum.areaSqm ?? 0), 4),
        cost: round(Number(wasteThisMonth._sum.costImpact ?? 0), 2),
      },
      offcutStock: {
        pieces: offcutStock._count._all,
        areaSqm: round(Number(offcutStock._sum.areaSqm ?? 0), 4),
        value: round(Number(offcutStock._sum.purchaseCost ?? 0), 2),
      },
    };
  }

  /**
   * Machine utilisation over a window, straight from the run log. Availability
   * here is running time over attended time — not textbook OEE, but the figure
   * a four-machine shop can act on without extra sensors.
   */
  async machineUtilization(from: Date, to: Date) {
    const logs = await this.prisma.machineRunLog.findMany({
      where: {
        startedAt: { gte: from },
        OR: [{ endedAt: { lte: to } }, { endedAt: null }],
      },
      include: {
        machine: { select: { id: true, code: true, name: true, hourlyRate: true } },
        downtimeReason: { select: { code: true, name: true, isPlanned: true } },
      },
    });

    const byMachine = new Map<
      string,
      {
        machineId: string;
        code: string;
        name: string;
        runningMinutes: number;
        idleMinutes: number;
        setupMinutes: number;
        downMinutes: number;
        downtimeByReason: Record<string, number>;
      }
    >();

    for (const log of logs) {
      const minutes =
        log.durationMinutes ??
        Math.max(
          Math.round(
            ((log.endedAt ?? new Date()).getTime() - log.startedAt.getTime()) / 60000,
          ),
          0,
        );

      const entry =
        byMachine.get(log.machineId) ??
        {
          machineId: log.machineId,
          code: log.machine.code,
          name: log.machine.name,
          runningMinutes: 0,
          idleMinutes: 0,
          setupMinutes: 0,
          downMinutes: 0,
          downtimeByReason: {},
        };

      if (log.state === MachineState.RUNNING) entry.runningMinutes += minutes;
      else if (log.state === MachineState.IDLE) entry.idleMinutes += minutes;
      else if (log.state === MachineState.SETUP) entry.setupMinutes += minutes;
      else {
        entry.downMinutes += minutes;
        const key = log.downtimeReason?.name ?? 'Unspecified';
        entry.downtimeByReason[key] = (entry.downtimeByReason[key] ?? 0) + minutes;
      }

      byMachine.set(log.machineId, entry);
    }

    return [...byMachine.values()].map((entry) => {
      const attended =
        entry.runningMinutes + entry.idleMinutes + entry.setupMinutes + entry.downMinutes;
      return {
        ...entry,
        attendedMinutes: attended,
        utilizationPct: attended > 0 ? round((entry.runningMinutes / attended) * 100, 2) : 0,
      };
    });
  }

  /** Material consumed vs. material that became product, per material. */
  async materialYield(from: Date, to: Date) {
    const issues = await this.prisma.jobMaterialIssue.groupBy({
      by: ['jobId'],
      where: { issuedAt: { gte: from, lte: to } },
      orderBy: { jobId: 'asc' },
      _sum: { areaSqm: true, cost: true },
    });

    const jobs = await this.prisma.job.findMany({
      where: { id: { in: issues.map((i) => i.jobId) } },
      select: {
        id: true,
        materialId: true,
        material: { select: { code: true, name: true } },
        nestPlan: { select: { partsAreaSqm: true, offcutAreaSqm: true } },
      },
    });
    const jobById = new Map(jobs.map((j) => [j.id, j]));

    const byMaterial = new Map<
      string,
      { code?: string; name?: string; issuedSqm: number; partsSqm: number; offcutSqm: number; cost: number }
    >();

    for (const issue of issues) {
      const job = jobById.get(issue.jobId);
      if (!job) continue;
      const entry =
        byMaterial.get(job.materialId) ?? {
          code: job.material.code,
          name: job.material.name,
          issuedSqm: 0,
          partsSqm: 0,
          offcutSqm: 0,
          cost: 0,
        };
      entry.issuedSqm += Number(issue._sum.areaSqm ?? 0);
      entry.cost += Number(issue._sum.cost ?? 0);
      entry.partsSqm += Number(job.nestPlan?.partsAreaSqm ?? 0);
      entry.offcutSqm += Number(job.nestPlan?.offcutAreaSqm ?? 0);
      byMaterial.set(job.materialId, entry);
    }

    return [...byMaterial.entries()].map(([materialId, entry]) => ({
      materialId,
      ...entry,
      issuedSqm: round(entry.issuedSqm, 4),
      partsSqm: round(entry.partsSqm, 4),
      offcutSqm: round(entry.offcutSqm, 4),
      cost: round(entry.cost, 2),
      yieldPct: entry.issuedSqm > 0 ? round((entry.partsSqm / entry.issuedSqm) * 100, 2) : 0,
      effectiveYieldPct:
        entry.issuedSqm > 0
          ? round(((entry.partsSqm + entry.offcutSqm) / entry.issuedSqm) * 100, 2)
          : 0,
    }));
  }

  /** Planned vs. actual minutes per completed job — where estimates drift. */
  async jobPerformance(from: Date, to: Date) {
    const jobs = await this.prisma.job.findMany({
      where: {
        status: JobStatus.COMPLETED,
        actualEnd: { gte: from, lte: to },
        estimatedMinutes: { not: null },
      },
      select: {
        id: true,
        code: true,
        estimatedMinutes: true,
        actualMinutes: true,
        machine: { select: { code: true, name: true } },
        material: { select: { code: true, name: true } },
      },
      orderBy: { actualEnd: 'desc' },
      take: 500,
    });

    return jobs.map((job) => {
      const estimated = job.estimatedMinutes ?? 0;
      const actual = job.actualMinutes ?? 0;
      return {
        ...job,
        varianceMinutes: actual - estimated,
        variancePct: estimated > 0 ? round(((actual - estimated) / estimated) * 100, 2) : null,
      };
    });
  }
}
