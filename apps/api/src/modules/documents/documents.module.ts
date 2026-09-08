import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';
import { FilesModule } from '../files/files.module';

@Module({
  // For the letterhead every printed document is drawn on.
  imports: [FilesModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, CodeGeneratorService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
