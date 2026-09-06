import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, CodeGeneratorService],
  exports: [InventoryService],
})
export class InventoryModule {}
