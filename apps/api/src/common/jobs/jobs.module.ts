import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JobLeaseService } from './job-lease.service';
import { JobRunnerService } from './job-runner.service';
import { JobRetentionJob } from './job-retention.job';
import { TenantHealthJob } from './tenant-health.job';

/**
 * Work that happens on a clock rather than on a request.
 *
 * Everything scheduled goes through JobRunnerService, so every job gets the
 * same three guarantees — one runner, a recorded outcome, no crash — without
 * each one having to remember. Jobs register themselves with @Cron and are
 * listed here.
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [JobLeaseService, JobRunnerService, TenantHealthJob, JobRetentionJob],
  exports: [JobRunnerService],
})
export class JobsModule {}
