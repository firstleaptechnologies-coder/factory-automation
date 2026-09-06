import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';
import { FilesModule } from '../files/files.module';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [FilesModule, ClientsModule],
  controllers: [OrdersController],
  providers: [OrdersService, CodeGeneratorService],
  exports: [OrdersService],
})
export class OrdersModule {}
