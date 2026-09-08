import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, CodeGeneratorService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
