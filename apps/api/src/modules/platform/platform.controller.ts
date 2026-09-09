import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { PERMISSIONS } from '@fas/shared';
import { PlatformService } from './platform.service';
import { SubscriptionsService } from './subscriptions.service';
import { PlatformStaffService } from './staff.service';
import {
  CreateTierDto,
  SetModulePriceDto,
  SetTierPriceDto,
  TierEffectDto,
} from './dto/pricing.dto';
import {
  CreateRoleDto,
  CreateStaffDto,
  SaveRoleDto,
  SaveStaffDto,
} from './dto/staff.dto';
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
    private readonly subscriptions: SubscriptionsService,
    private readonly impersonation: ImpersonationService,
    private readonly staffService: PlatformStaffService,
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

  /**
   * One workspace, all the way down.
   *
   * Its own route rather than widening the list: reading each shop's people
   * and roles means a query inside their database, and doing that for every
   * workspace to draw a list is a page that gets slower the better we do.
   */
  @RequirePermissions(PERMISSIONS.PLATFORM_TENANT_VIEW)
  @Get('tenants/:id/detail')
  detail(@Param('id') id: string) {
    return this.platform.detail(id);
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
  // -- what we charge ---------------------------------------------------------

  /**
   * Everything the FirstLeap dashboard shows, in one call.
   *
   * A dashboard assembled from three requests arrives in three pieces in front
   * of whoever opened it.
   */
  @Get('overview')
  @RequirePermissions(PERMISSIONS.PLATFORM_TENANT_VIEW)
  overview() {
    return this.subscriptions.overview();
  }

  @Get('tiers')
  @RequirePermissions(PERMISSIONS.PLATFORM_TENANT_VIEW)
  tiers() {
    return this.subscriptions.tiers();
  }

  @Post('tiers')
  @RequirePermissions(PERMISSIONS.PLATFORM_PRICING_MANAGE)
  createTier(@Body() body: CreateTierDto) {
    return this.subscriptions.createTier(body);
  }

  @Patch('tiers/:key')
  @RequirePermissions(PERMISSIONS.PLATFORM_PRICING_MANAGE)
  setTierPrice(@Param('key') key: string, @Body() body: SetTierPriceDto) {
    return this.subscriptions.setTierPrice(key, body);
  }

  @Delete('tiers/:key')
  @RequirePermissions(PERMISSIONS.PLATFORM_PRICING_MANAGE)
  deleteTier(@Param('key') key: string) {
    return this.subscriptions.deleteTier(key);
  }

  /**
   * Who would lose what, asked before the tier is saved.
   *
   * A POST because it takes a body, not because it changes anything — it is
   * the one screen where a careless tick takes a module off a shop that is
   * using it today.
   */
  @Post('tiers/:key/effect')
  @RequirePermissions(PERMISSIONS.PLATFORM_TENANT_VIEW)
  tierEffect(@Param('key') key: string, @Body() body: TierEffectDto) {
    return this.subscriptions.effectOfTierChange(key, body.includedModules);
  }

  @Get('module-prices')
  @RequirePermissions(PERMISSIONS.PLATFORM_TENANT_VIEW)
  modulePrices() {
    return this.subscriptions.modulePrices();
  }

  @Patch('module-prices/:moduleKey')
  @RequirePermissions(PERMISSIONS.PLATFORM_PRICING_MANAGE)
  setModulePrice(@Param('moduleKey') moduleKey: string, @Body() body: SetModulePriceDto) {
    return this.subscriptions.setModulePrice(moduleKey, body.monthlyPrice);
  }

  /**
   * Did last night's work run?
   *
   * Its own route rather than part of the overview: it answers a different
   * question, it is looked at on a different rhythm, and a slow read of the
   * job log should not make the money figures slow.
   */
  /**
   * The book of business: what everybody is on, and what needs doing this week.
   *
   * Behind the view permission rather than the pricing one — somebody has to
   * be able to see a trial running out without being able to change what it
   * costs.
   */
  @Get('billing')
  @RequirePermissions(PERMISSIONS.PLATFORM_TENANT_VIEW)
  billing() {
    return this.subscriptions.billing();
  }

  @Get('job-health')
  @RequirePermissions(PERMISSIONS.PLATFORM_TENANT_VIEW)
  jobHealth() {
    return this.subscriptions.jobHealth();
  }

  /**
   * Who at FirstLeap may do what.
   *
   * Behind its own permission rather than tenant management, because this is
   * the power that hands out every other power: putting a colleague on Owner
   * gives them, in one step, every workspace we host.
   */
  @Get('roles')
  @RequirePermissions(PERMISSIONS.PLATFORM_STAFF_VIEW)
  roles() {
    return this.staffService.roles();
  }

  @Post('roles')
  @RequirePermissions(PERMISSIONS.PLATFORM_STAFF_MANAGE)
  createRole(@Body() dto: CreateRoleDto) {
    return this.staffService.createRole(dto);
  }

  @Patch('roles/:key')
  @RequirePermissions(PERMISSIONS.PLATFORM_STAFF_MANAGE)
  saveRole(@Param('key') key: string, @Body() dto: SaveRoleDto, @CurrentUser() user: AuthUser) {
    return this.staffService.saveRole(key, dto, user.id);
  }

  @Delete('roles/:key')
  @RequirePermissions(PERMISSIONS.PLATFORM_STAFF_MANAGE)
  deleteRole(@Param('key') key: string) {
    return this.staffService.deleteRole(key);
  }

  @Get('staff')
  @RequirePermissions(PERMISSIONS.PLATFORM_STAFF_VIEW)
  staff() {
    return this.staffService.staff();
  }

  @Post('staff')
  @RequirePermissions(PERMISSIONS.PLATFORM_STAFF_MANAGE)
  createStaff(@Body() dto: CreateStaffDto) {
    return this.staffService.createStaff(dto);
  }

  @Patch('staff/:id')
  @RequirePermissions(PERMISSIONS.PLATFORM_STAFF_MANAGE)
  saveStaff(@Param('id') id: string, @Body() dto: SaveStaffDto, @CurrentUser() user: AuthUser) {
    return this.staffService.saveStaff(id, dto, user.id);
  }
}
