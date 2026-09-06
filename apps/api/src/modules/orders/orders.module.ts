import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, CodeGeneratorService],
  exports: [OrdersService],
})
export class OrdersModule {}
