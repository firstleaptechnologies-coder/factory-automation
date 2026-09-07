import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PERMISSIONS } from '@decor/shared';
import { PlatformService } from './platform.service';
import {
  ChangeIsolationDto,
  CreateTenantDto,
  UpdateTenantDto,
} from './dto/tenant.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

/** The control plane. Only platform users hold these permissions. */
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @RequirePermissions(PERMISSIONS.PLATFORM_TENANT_VIEW)
  @Get('tenants')
  list() {
    return this.platform.list();
  }

  @RequirePermissions(PERMISSIONS.PLATFORM_TENANT_VIEW)
  @Get('tenants/:id')
  findOne(@Param('id') id: string) {
    return this.platform.findOne(id);
  }

  @RequirePermissions(PERMISSIONS.PLATFORM_TENANT_MANAGE)
  @Post('tenants')
  create(@Body() dto: CreateTenantDto) {
    return this.platform.create(dto);
  }

  @RequirePermissions(PERMISSIONS.PLATFORM_TENANT_MANAGE)
  @Patch('tenants/:id')
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.platform.update(id, dto);
  }

  @RequirePermissions(PERMISSIONS.PLATFORM_TENANT_MANAGE)
  @Patch('tenants/:id/isolation')
  changeIsolation(@Param('id') id: string, @Body() dto: ChangeIsolationDto) {
    return this.platform.changeIsolation(id, dto);
  }
}
