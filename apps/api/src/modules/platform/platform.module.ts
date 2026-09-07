import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { TenantProvisioningService } from './tenant-provisioning.service';

@Module({
  controllers: [PlatformController],
  providers: [PlatformService, TenantProvisioningService],
  exports: [PlatformService, TenantProvisioningService],
})
export class PlatformModule {}
