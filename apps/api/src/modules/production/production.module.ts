import { Module } from '@nestjs/common';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';

@Module({
  controllers: [ProductionController],
  providers: [ProductionService, CodeGeneratorService],
  exports: [ProductionService],
})
export class ProductionModule {}
