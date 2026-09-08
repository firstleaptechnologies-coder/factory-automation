import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JobLeaseService } from './job-lease.service';
import { JobRunnerService } from './job-runner.service';
import { JobRetentionJob } from './job-retention.job';
import { LogRetentionJob } from './log-retention.job';
import { TenantHealthJob } from './tenant-health.job';
import { currentRole, runsScheduledWork } from './role';

/**
 * Work that happens on a clock rather than on a request.
 *
 * Everything scheduled goes through JobRunnerService, so every job gets the
 * same three guarantees — one runner, a recorded outcome, no crash — without
 * each one having to remember. Jobs register themselves with @Cron and are
 * listed here.
 *
 * Only a process whose ROLE runs scheduled work arms the scheduler. The lease
 * already makes it safe for several to try, so this is not about correctness:
 * it is so that scaling the API to more instances does not scale the number of
 * schedulers contending at 03:20 along with it. See `role.ts`.
 *
 * JobLeaseService and JobRunnerService are provided either way — an API
 * process still needs the runner for work it kicks off itself, and this module
 * exports it.
 */
const scheduled = runsScheduledWork(currentRole());

@Module({
  imports: scheduled ? [ScheduleModule.forRoot()] : [],
  providers: [
    JobLeaseService,
    JobRunnerService,
    ...(scheduled ? [TenantHealthJob, JobRetentionJob, LogRetentionJob] : []),
  ],
  exports: [JobRunnerService],
})
export class JobsModule {}
