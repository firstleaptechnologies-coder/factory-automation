import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { FilesService } from './files.service';

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /**
   * Files are served through the API rather than by a public URL: they are
   * encrypted at rest, and the auth guard is what decides who may see a
   * client's drawings.
   */
  @Get(':id')
  async download(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { file, data } = await this.files.read(id);

    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(data.byteLength),
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
      // Content is immutable per id, but it is private to the signed-in user.
      'Cache-Control': 'private, max-age=31536000, immutable',
    });

    return new StreamableFile(data);
  }
}
