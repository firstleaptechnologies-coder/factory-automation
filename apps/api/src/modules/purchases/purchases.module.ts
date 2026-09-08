import { Module } from '@nestjs/common';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { StockService } from '../stock/stock.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';

@Module({
  controllers: [PurchasesController],
  providers: [PurchasesService, StockService, CodeGeneratorService],
  exports: [PurchasesService, StockService],
})
export class PurchasesModule {}
