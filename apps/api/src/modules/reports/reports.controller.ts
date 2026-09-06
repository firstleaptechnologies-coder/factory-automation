import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';

/** Defaults to the last 30 days when the caller does not pass a window. */
function parseRange(from?: string, to?: string): { from: Date; to: Date } {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: start, to: end };
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  dashboard() {
    return this.reports.dashboard();
  }

  @Get('machine-utilization')
  machineUtilization(@Query('from') from?: string, @Query('to') to?: string) {
    const range = parseRange(from, to);
    return this.reports.machineUtilization(range.from, range.to);
  }

  @Get('material-yield')
  materialYield(@Query('from') from?: string, @Query('to') to?: string) {
    const range = parseRange(from, to);
    return this.reports.materialYield(range.from, range.to);
  }

  @Get('job-performance')
  jobPerformance(@Query('from') from?: string, @Query('to') to?: string) {
    const range = parseRange(from, to);
    return this.reports.jobPerformance(range.from, range.to);
  }
}
