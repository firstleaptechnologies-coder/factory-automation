import { Module } from '@nestjs/common';
import { JobsModule } from '../../common/jobs/jobs.module';
import { currentRole, runsScheduledWork } from '../../common/jobs/role';
import { StorageModule } from '../../common/storage/storage.module';
import { ReportsController } from './reports.controller';
import { ReportsJob } from './reports.job';
import { ReportsService } from './reports.service';

/**
 * Reports: asked for on a request, built on a clock.
 *
 * The job is provided only where scheduled work runs, so an API instance does
 * not arm a builder it is never meant to run — the same gate as every other
 * @Cron handler. On a single process both still happen, which is what local
 * development and a one-container deployment need.
 */
@Module({
  imports: [JobsModule, StorageModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ...(runsScheduledWork(currentRole()) ? [ReportsJob] : []),
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
