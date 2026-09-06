import { Module } from '@nestjs/common';
import { NestingController } from './nesting.controller';
import { NestingService } from './nesting.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';

@Module({
  controllers: [NestingController],
  providers: [NestingService, CodeGeneratorService],
  exports: [NestingService],
})
export class NestingModule {}
