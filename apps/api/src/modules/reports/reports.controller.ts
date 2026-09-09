import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MODULES, PERMISSIONS } from '@fas/shared';
import { ReportsService } from './reports.service';
import { ReportQueryDto, RequestReportDto } from './dto/report.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireModule } from '../../common/decorators/module.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Asking for a report and fetching it back.
 *
 * Behind the reports module, which is sold on its own. It was briefly behind
 * finance — most of what these export is money — and that was wrong the moment
 * reports became something a shop pays for separately: it handed every tier
 * that includes finance the whole export suite for nothing.
 *
 * Running one and reading one are separate permissions. A shop accountant who
 * may download the GST summary is not necessarily somebody who should be able
 * to queue a full-year export of every register at four in the afternoon.
 */
@RequireModule(MODULES.REPORTS)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.REPORT_VIEW)
  list(@Query() query: ReportQueryDto) {
    return this.reports.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.REPORT_VIEW)
  one(@Param('id') id: string) {
    return this.reports.one(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.REPORT_RUN)
  request(@Body() body: RequestReportDto, @CurrentUser() user: AuthUser) {
    return this.reports.request(body, user?.id);
  }

  /**
   * The file itself.
   *
   * Streamed with a filename the person will recognise in a downloads folder,
   * rather than a cuid.
   */
  @Get(':id/download')
  @RequirePermissions(PERMISSIONS.REPORT_VIEW)
  async download(@Param('id') id: string, @Res() response: Response): Promise<void> {
    const file = await this.reports.download(id);

    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', file.data.byteLength);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName.replace(/"/g, '')}"`,
    );
    response.end(file.data);
  }
}
