import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
import { FilesService } from '../files/files.service';
import { renderLeadHtml } from './lead-document';

@RequireModule(MODULES.LEADS)
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly customFields: CustomFieldsService,
    private readonly files: FilesService,
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

  /**
   * The enquiry as a page somebody can read.
   *
   * HTML rather than a PDF, exactly as the quotation is: the app shows this
   * markup directly and turns the same markup into a PDF when it is shared,
   * so what was previewed is what gets sent. Rendering it twice — once for
   * the screen and once for the file — is how the two end up different.
   */
  @RequirePermissions(PERMISSIONS.LEAD_VIEW)
  @Get(':id/document')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async document(@Param('id') id: string) {
    const data = await this.leads.forPrinting(id);
    return renderLeadHtml({
      ...data,
      // Inlined as a data URI rather than linked: the app renders this inside
      // a PDF converter that will not fetch anything, and a letterhead that
      // silently fails to load is a document nobody can send.
      letterheadUrl: await this.dataUri(data.firm.letterheadFileId),
      logoUrl: await this.dataUri(data.firm.logoFileId),
    });
  }

  /** The firm's letterhead as bytes, or nothing if it has gone missing. */
  private async dataUri(fileId?: string | null): Promise<string | null> {
    if (!fileId) return null;
    try {
      const { file, data } = await this.files.read(fileId);
      return `data:${file.mimeType};base64,${data.toString('base64')}`;
    } catch {
      // A missing letterhead must not stop the enquiry printing.
      return null;
    }
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
