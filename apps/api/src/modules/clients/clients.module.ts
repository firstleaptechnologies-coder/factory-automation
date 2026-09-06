import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';

@Module({
  controllers: [ClientsController],
  providers: [ClientsService, CodeGeneratorService],
  exports: [ClientsService],
})
export class ClientsModule {}
