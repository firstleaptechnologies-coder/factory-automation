import { Module } from '@nestjs/common';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';

@Module({
  controllers: [VendorsController],
  providers: [VendorsService, CodeGeneratorService],
  exports: [VendorsService],
})
export class VendorsModule {}
