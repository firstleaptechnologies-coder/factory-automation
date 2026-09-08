import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PERMISSIONS } from '@decor/shared';
import { PlatformService } from './platform.service';
import { ImpersonationService } from './impersonation.service';
import {
  ChangeIsolationDto,
  CreateTenantDto,
  UpdateTenantDto,
  ImpersonateDto,
} from './dto/tenant.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

/** The control plane. Only platform users hold these permissions. */
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly impersonation: ImpersonationService,
  ) {}

  /**
   * Open a workspace to help whoever is in it.
   *
   * Its own permission, held by support and by nobody else by default: it is
   * the one platform power that reaches inside a shop's data, and it should be
   * possible to hand somebody the release console without handing them this.
   */
  @RequirePermissions(PERMISSIONS.PLATFORM_IMPERSONATE)
  @Post('tenants/:id/open')
  open(
    @Param('id') id: string,
    @Body() dto: ImpersonateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.impersonation.start(id, dto.reason, { id: user.id, name: user.name });
  }

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
