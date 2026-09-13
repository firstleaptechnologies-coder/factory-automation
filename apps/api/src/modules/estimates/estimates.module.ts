import { Module } from '@nestjs/common';
import { EstimatesController } from './estimates.controller';
import { EstimatesService } from './estimates.service';
import { FilesModule } from '../files/files.module';
import { OrdersModule } from '../orders/orders.module';
import { ClientsModule } from '../clients/clients.module';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';

@Module({
  imports: [FilesModule, OrdersModule, ClientsModule],
  controllers: [EstimatesController],
  providers: [EstimatesService, CodeGeneratorService],
  exports: [EstimatesService],
})
export class EstimatesModule {}
