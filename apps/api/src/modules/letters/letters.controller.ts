import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { LetterKind } from '@prisma/client';
import { MODULES, PERMISSIONS } from '@fas/shared';
import { LettersService } from './letters.service';
import { renderLetterHtml } from './letter-document';
import { IssueLetterDto, LetterQueryDto, LetterTemplateDto } from './dto/letter.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireModule } from '../../common/decorators/module.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@RequireModule(MODULES.HR)
@Controller('letters')
export class LettersController {
  constructor(
    private readonly letters: LettersService,
    private readonly files: FilesService,
    private readonly prisma: PrismaService,
  ) {}

  // -- templates ------------------------------------------------------------

  @RequirePermissions(PERMISSIONS.EMPLOYEE_VIEW)
  @Get('templates')
  templates(@Query('kind') kind?: LetterKind) {
    return this.letters.templates(kind);
  }

  @RequirePermissions(PERMISSIONS.EMPLOYEE_MANAGE)
  @Post('templates')
  createTemplate(@Body() dto: LetterTemplateDto) {
    return this.letters.createTemplate(dto);
  }

  @RequirePermissions(PERMISSIONS.EMPLOYEE_MANAGE)
  @Patch('templates/:id')
  updateTemplate(@Param('id') id: string, @Body() dto: LetterTemplateDto) {
    return this.letters.updateTemplate(id, dto);
  }

  /** What a template says once it is about a particular person. */
  @RequirePermissions(PERMISSIONS.EMPLOYEE_MANAGE)
  @Get('draft')
  draft(@Query('templateId') templateId: string, @Query('employeeId') employeeId: string) {
    return this.letters.draft(templateId, employeeId);
  }

  // -- letters --------------------------------------------------------------

  @RequirePermissions(PERMISSIONS.EMPLOYEE_VIEW)
  @Get()
  list(@Query() query: LetterQueryDto) {
    return this.letters.letters(query);
  }

  @RequirePermissions(PERMISSIONS.EMPLOYEE_VIEW)
  @Get(':id')
  letter(@Param('id') id: string) {
    return this.letters.letter(id);
  }

  /** Files a letter as it was given. */
  @RequirePermissions(PERMISSIONS.EMPLOYEE_MANAGE)
  @Post()
  issue(@Body() dto: IssueLetterDto, @CurrentUser() user?: AuthUser) {
    return this.letters.issue(dto, user?.id);
  }

  /**
   * The letter itself, on the shop's letterhead.
   *
   * HTML rather than a PDF, like the estimate: the app turns it into one on
   * the device, which is what makes handing it over a single step, and the web
   * prints the very same markup.
   */
  @RequirePermissions(PERMISSIONS.EMPLOYEE_VIEW)
  @Get(':id/document')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async document(@Param('id') id: string) {
    const letter = await this.letters.letter(id);
    const firm = (await this.prisma.firmProfile.findFirst()) ?? { name: '' };

    return renderLetterHtml({
      letter,
      employee: letter.employee,
      firm: firm as unknown as Record<string, unknown>,
      // Inlined rather than linked: the app renders this inside a PDF
      // converter that will not fetch anything, and a letterhead that silently
      // fails to load is a letter nobody can hand over.
      letterheadUrl: await this.dataUri(
        (firm as { letterheadFileId?: string | null }).letterheadFileId,
      ),
      logoUrl: await this.dataUri((firm as { logoFileId?: string | null }).logoFileId),
    });
  }

  /** A stored file as a data URI, or nothing when there is none. */
  private async dataUri(fileId?: string | null): Promise<string | null> {
    if (!fileId) return null;
    try {
      const { file, data } = await this.files.read(fileId);
      return `data:${file.mimeType};base64,${data.toString('base64')}`;
    } catch {
      return null;
    }
  }
}
