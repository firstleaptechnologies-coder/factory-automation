import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CustomFieldEntity, UserRole } from '@prisma/client';
import { LeadsService } from './leads.service';
import { CustomFieldsService } from './custom-fields.service';
import {
  ChangeLeadStatusDto,
  ConvertLeadDto,
  CreateLeadDto,
  CustomFieldDto,
  LeadQueryDto,
  LeadSourceDto,
  UpdateCustomFieldDto,
  UpdateLeadDto,
} from './dto/lead.dto';
import { MODULES, PERMISSIONS } from '@fas/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireModule } from '../../common/decorators/module.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@RequireModule(MODULES.LEADS)
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly customFields: CustomFieldsService,
  ) {}

  @RequirePermissions(PERMISSIONS.LEAD_VIEW)
  @Get()
  list(@Query() query: LeadQueryDto) {
    return this.leads.list(query);
  }

  @RequirePermissions(PERMISSIONS.LEAD_VIEW)
  @Get('board')
  board(@Query('workflowId') workflowId?: string) {
    return this.leads.board(workflowId);
  }

  @RequirePermissions(PERMISSIONS.LEAD_VIEW)
  @Get('sources')
  listSources(@Query('includeInactive') includeInactive?: string) {
    return this.leads.listSources(includeInactive === 'true');
  }

  /** Field definitions the lead form builds itself from. */
  @RequirePermissions(PERMISSIONS.LEAD_VIEW)
  @Get('fields')
  listFields(@Query('includeInactive') includeInactive?: string) {
    return this.customFields.list(CustomFieldEntity.LEAD, includeInactive === 'true');
  }

  @RequirePermissions(PERMISSIONS.LEAD_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leads.findOne(id);
  }

  @RequirePermissions(PERMISSIONS.LEAD_CREATE)
  @Post()
  create(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthUser) {
    return this.leads.create(dto, user?.id);
  }

  @RequirePermissions(PERMISSIONS.LEAD_EDIT)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leads.update(id, dto);
  }

  // As with orders: which people may move an enquiry along is the shop's own
  // decision, so it is a permission rather than a hard-coded role.
  @RequirePermissions(PERMISSIONS.LEAD_MOVE_STATUS)
  @Post(':id/status')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeLeadStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leads.changeStatus(id, dto, user);
  }

  @RequirePermissions(PERMISSIONS.LEAD_CONVERT)
  @Post(':id/convert')
  convert(
    @Param('id') id: string,
    @Body() dto: ConvertLeadDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leads.convert(id, dto, user);
  }

  // -- admin configuration --------------------------------------------------

  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @Post('sources')
  createSource(@Body() dto: LeadSourceDto) {
    return this.leads.createSource(dto);
  }

  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @Post('fields')
  createField(@Body() dto: CustomFieldDto) {
    return this.customFields.create(dto);
  }

  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @Patch('fields/:fieldId')
  updateField(@Param('fieldId') fieldId: string, @Body() dto: UpdateCustomFieldDto) {
    return this.customFields.update(fieldId, dto);
  }

  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @Delete('fields/:fieldId')
  deactivateField(@Param('fieldId') fieldId: string) {
    return this.customFields.deactivate(fieldId);
  }
}
