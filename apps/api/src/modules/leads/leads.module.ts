import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { CustomFieldsService } from './custom-fields.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [OrdersModule],
  controllers: [LeadsController],
  providers: [LeadsService, CustomFieldsService, CodeGeneratorService],
  exports: [LeadsService, CustomFieldsService],
})
export class LeadsModule {}
