import { Global, Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerReconcileJob } from './ledger-reconcile.job';
import { JobsModule } from '../../common/jobs/jobs.module';
import { currentRole, runsScheduledWork } from '../../common/jobs/role';

/**
 * Global, because everything that moves money posts to it.
 *
 * The alternative — importing this into payments, payouts, expenses, purchases
 * and payroll — makes a cycle out of the first module that also needs one of
 * those.
 */
@Global()
@Module({
  // For the runner the nightly reconcile takes its lease from.
  imports: [JobsModule],
  // The reconcile job lives with the rest of the scheduled work: an API
  // process should not arm a 03:20 handler it is never meant to run.
  providers: [
    LedgerService,
    ...(runsScheduledWork(currentRole()) ? [LedgerReconcileJob] : []),
  ],
  exports: [LedgerService],
})
export class LedgerModule {}
