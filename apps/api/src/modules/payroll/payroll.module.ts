import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  // The register is where a month's days come from.
  imports: [AttendanceModule],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
