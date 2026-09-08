import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { ImpersonationService } from './impersonation.service';

@Module({
  imports: [
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
  controllers: [PlatformController],
  providers: [PlatformService, TenantProvisioningService, ImpersonationService],
  exports: [PlatformService, TenantProvisioningService],
})
export class PlatformModule {}
