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
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly customFields: CustomFieldsService,
  ) {}

  @Get()
  list(@Query() query: LeadQueryDto) {
    return this.leads.list(query);
  }

  @Get('board')
  board(@Query('workflowId') workflowId?: string) {
    return this.leads.board(workflowId);
  }

  @Get('sources')
  listSources(@Query('includeInactive') includeInactive?: string) {
    return this.leads.listSources(includeInactive === 'true');
  }

  /** Field definitions the lead form builds itself from. */
  @Get('fields')
  listFields(@Query('includeInactive') includeInactive?: string) {
    return this.customFields.list(CustomFieldEntity.LEAD, includeInactive === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leads.findOne(id);
  }

  @Roles(UserRole.SALES, UserRole.MANAGER)
  @Post()
  create(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthUser) {
    return this.leads.create(dto, user?.id);
  }

  @Roles(UserRole.SALES, UserRole.MANAGER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leads.update(id, dto);
  }

  @Post(':id/status')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeLeadStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leads.changeStatus(id, dto, user);
  }

  @Roles(UserRole.SALES, UserRole.MANAGER)
  @Post(':id/convert')
  convert(
    @Param('id') id: string,
    @Body() dto: ConvertLeadDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leads.convert(id, dto, user);
  }

  // -- admin configuration --------------------------------------------------

  @Roles(UserRole.ADMIN)
  @Post('sources')
  createSource(@Body() dto: LeadSourceDto) {
    return this.leads.createSource(dto);
  }

  @Roles(UserRole.ADMIN)
  @Post('fields')
  createField(@Body() dto: CustomFieldDto) {
    return this.customFields.create(dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch('fields/:fieldId')
  updateField(@Param('fieldId') fieldId: string, @Body() dto: UpdateCustomFieldDto) {
    return this.customFields.update(fieldId, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete('fields/:fieldId')
  deactivateField(@Param('fieldId') fieldId: string) {
    return this.customFields.deactivate(fieldId);
  }
}
