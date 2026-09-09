import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { SubscriptionsService } from './subscriptions.service';
import { PlatformStaffService } from './staff.service';
import { PlatformBillingService } from './billing.service';
import { PlatformBillingController } from './billing.controller';
import { RazorpayService } from './razorpay/razorpay.service';
import { BillingJob } from './billing.job';
import { JobsModule } from '../../common/jobs/jobs.module';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { ImpersonationService } from './impersonation.service';

@Module({
  imports: [
    JobsModule,
    // The billing job takes a lease and writes a JobRun row like every other
    // scheduled thing, so it needs the runner.
    // Its own registration rather than a shared one: the support session is
    // signed with the same secret but a much shorter life.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-only-change-in-production',
      }),
    }),
  ],
  controllers: [PlatformController, PlatformBillingController],
  providers: [
    PlatformService,
    SubscriptionsService,
    TenantProvisioningService,
    ImpersonationService,
    PlatformStaffService,
    PlatformBillingService,
    RazorpayService,
    BillingJob,
  ],
  exports: [PlatformService, TenantProvisioningService, PlatformBillingService],
})
export class PlatformModule {}
