import { Module } from '@nestjs/common';
import { LettersController } from './letters.controller';
import { LettersService } from './letters.service';
import { FilesModule } from '../files/files.module';

@Module({
  // For the letterhead every printed letter is drawn on.
  imports: [FilesModule],
  controllers: [LettersController],
  providers: [LettersService],
  exports: [LettersService],
})
export class LettersModule {}
