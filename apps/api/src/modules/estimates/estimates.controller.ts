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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MODULES, PERMISSIONS } from '@fas/shared';
import { EstimatesService } from './estimates.service';
import { renderEstimateHtml } from './estimate-document';
import {
  CreateEstimateDto,
  EstimateQueryDto,
  ConvertEstimateDto,
  EstimateStatusDto,
  FirmProfileDto,
  UpdateEstimateDto,
} from './dto/estimate.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireModule } from '../../common/decorators/module.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { FilesService, IncomingFile } from '../files/files.service';
import { AttachmentKind } from '@prisma/client';

@Controller()
export class EstimatesController {
  constructor(
    private readonly estimates: EstimatesService,
    private readonly files: FilesService,
  ) {}

  // -- the firm's own details ------------------------------------------------

  @RequirePermissions(PERMISSIONS.CONFIG_VIEW)
  @Get('firm')
  firm() {
    return this.estimates.firmProfile();
  }

  /**
   * The bit of the firm profile every signed-in user needs, whatever their
   * role: the accent their software should be painted in. Kept apart from the
   * full profile so a production hand who may not see bank details still gets
   * the right colours.
   */
  @Get('firm/theme')
  theme() {
    return this.estimates.theme();
  }

  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @Patch('firm')
  saveFirm(@Body() dto: FirmProfileDto) {
    return this.estimates.saveFirmProfile(dto);
  }

  /** The letterhead every printed document is drawn on. */
  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @Post('firm/letterhead')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLetterhead(
    @UploadedFile() file: IncomingFile,
    @CurrentUser() user: AuthUser,
    @Query('kind') kind?: string,
  ) {
    const stored = await this.files.ingest(file, AttachmentKind.DOCUMENT, user?.id);
    return this.estimates.setLetterhead(
      stored.id,
      kind === 'logo' ? 'logo' : 'letterhead',
    );
  }

  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @Delete('firm/letterhead')
  clearLetterhead(@Query('kind') kind?: string) {
    return this.estimates.setLetterhead(null, kind === 'logo' ? 'logo' : 'letterhead');
  }

  private async dataUri(fileId?: string | null): Promise<string | null> {
    if (!fileId) return null;
    try {
      const { file, data } = await this.files.read(fileId);
      return `data:${file.mimeType};base64,${data.toString('base64')}`;
    } catch {
      // A letterhead that has gone missing must not stop the estimate printing.
      return null;
    }
  }

  // -- estimates -------------------------------------------------------------

  @RequirePermissions(PERMISSIONS.ESTIMATE_VIEW)
  @RequireModule(MODULES.QUOTES)
  @Get('estimates')
  list(@Query() query: EstimateQueryDto) {
    return this.estimates.list(query);
  }

  @RequirePermissions(PERMISSIONS.ESTIMATE_VIEW)
  @RequireModule(MODULES.QUOTES)
  @Get('estimates/:id')
  findOne(@Param('id') id: string) {
    return this.estimates.findOne(id);
  }

  /**
   * The document itself. Returned as HTML rather than a PDF so the app can turn
   * it into one on the device — which is what makes sharing it to WhatsApp a
   * single step — while the web can print the very same markup.
   */
  @RequirePermissions(PERMISSIONS.ESTIMATE_VIEW)
  @RequireModule(MODULES.QUOTES)
  @Get('estimates/:id/document')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async document(@Param('id') id: string) {
    const data = await this.estimates.forPrinting(id);
    return renderEstimateHtml({
      ...data,
      // Inlined as a data URI rather than linked: the app renders this HTML
      // offline inside a PDF converter that will not fetch anything, and a
      // letterhead that silently fails to load is a document nobody can send.
      letterheadUrl: await this.dataUri(data.firm.letterheadFileId),
      logoUrl: await this.dataUri(data.firm.logoFileId),
    });
  }

  @RequirePermissions(PERMISSIONS.ESTIMATE_MANAGE)
  @RequireModule(MODULES.QUOTES)
  @Post('estimates')
  create(@Body() dto: CreateEstimateDto, @CurrentUser() user: AuthUser) {
    return this.estimates.create(dto, user?.id);
  }

  @RequirePermissions(PERMISSIONS.ESTIMATE_MANAGE)
  @RequireModule(MODULES.QUOTES)
  @Patch('estimates/:id')
  update(@Param('id') id: string, @Body() dto: UpdateEstimateDto) {
    return this.estimates.update(id, dto);
  }

  @RequirePermissions(PERMISSIONS.ESTIMATE_MANAGE)
  @RequireModule(MODULES.QUOTES)
  @Post('estimates/:id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: EstimateStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.estimates.setStatus(id, dto.status, user?.id);
  }

  /** Turn an accepted quotation into a real order. The estimate is kept. */
  @RequirePermissions(PERMISSIONS.ESTIMATE_MANAGE, PERMISSIONS.ORDER_PUNCH)
  @RequireModule(MODULES.QUOTES)
  @Post('estimates/:id/convert')
  convert(
    @Param('id') id: string,
    @Body() dto: ConvertEstimateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.estimates.convertToOrder(id, dto, user?.id);
  }

  @RequirePermissions(PERMISSIONS.ESTIMATE_MANAGE)
  @RequireModule(MODULES.QUOTES)
  @Delete('estimates/:id')
  remove(@Param('id') id: string) {
    return this.estimates.remove(id);
  }
}
