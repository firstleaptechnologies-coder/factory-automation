import { Global, Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerReconcileJob } from './ledger-reconcile.job';
import { JobsModule } from '../../common/jobs/jobs.module';

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
  providers: [LedgerService, LedgerReconcileJob],
  exports: [LedgerService],
})
export class LedgerModule {}
