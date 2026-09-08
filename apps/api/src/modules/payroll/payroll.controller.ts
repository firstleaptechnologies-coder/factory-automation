import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { MODULES, PERMISSIONS } from '@decor/shared';
import { PayrollService } from './payroll.service';
import {
  AdjustPayslipDto,
  AdvanceDto,
  OpenRunDto,
  PayRunDto,
  PayStructureDto,
} from './dto/payroll.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireModule } from '../../common/decorators/module.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@RequireModule(MODULES.HR)
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  // -- how somebody is paid -------------------------------------------------

  @RequirePermissions(PERMISSIONS.SALARY_VIEW)
  @Get('structures')
  structures(@Query('employeeId') employeeId?: string) {
    return this.payroll.structures(employeeId);
  }

  /** A raise is a new arrangement, not an edit to the old one. */
  @RequirePermissions(PERMISSIONS.SALARY_MANAGE)
  @Post('structures')
  setStructure(@Body() dto: PayStructureDto, @CurrentUser() user?: AuthUser) {
    return this.payroll.setStructure(dto, user?.id);
  }

  // -- advances -------------------------------------------------------------

  @RequirePermissions(PERMISSIONS.SALARY_VIEW)
  @Get('advances')
  advances(@Query('employeeId') employeeId?: string) {
    return this.payroll.advances(employeeId);
  }

  /** Money handed over before it is earned. It leaves the drawer today. */
  @RequirePermissions(PERMISSIONS.SALARY_MANAGE)
  @Post('advances')
  giveAdvance(@Body() dto: AdvanceDto, @CurrentUser() user?: AuthUser) {
    return this.payroll.giveAdvance(dto, user?.id);
  }

  // -- the month ------------------------------------------------------------

  @RequirePermissions(PERMISSIONS.SALARY_VIEW)
  @Get('runs')
  runs() {
    return this.payroll.runs();
  }

  @RequirePermissions(PERMISSIONS.SALARY_VIEW)
  @Get('runs/:id')
  run(@Param('id') id: string) {
    return this.payroll.run(id);
  }

  /** Opens a month and works out what everybody is owed. Draft on purpose. */
  @RequirePermissions(PERMISSIONS.SALARY_MANAGE)
  @Post('runs')
  open(@Body() dto: OpenRunDto, @CurrentUser() user?: AuthUser) {
    return this.payroll.open(dto, user?.id);
  }

  @RequirePermissions(PERMISSIONS.SALARY_MANAGE)
  @Patch('runs/:id/payslips/:payslipId')
  adjust(
    @Param('id') id: string,
    @Param('payslipId') payslipId: string,
    @Body() dto: AdjustPayslipDto,
  ) {
    return this.payroll.adjust(id, payslipId, dto);
  }

  @RequirePermissions(PERMISSIONS.SALARY_MANAGE)
  @Post('runs/:id/approve')
  approve(@Param('id') id: string) {
    return this.payroll.approve(id);
  }

  /**
   * Pays it, and posts a ledger entry per person.
   *
   * Gated apart from drafting: working out what a month costs and handing the
   * money over are different decisions, often by different people.
   */
  @RequirePermissions(PERMISSIONS.SALARY_PAY)
  @Post('runs/:id/pay')
  pay(@Param('id') id: string, @Body() dto: PayRunDto, @CurrentUser() user?: AuthUser) {
    return this.payroll.pay(id, dto, user?.id);
  }

  /** A draft can be thrown away. Anything further along cannot. */
  @RequirePermissions(PERMISSIONS.SALARY_MANAGE)
  @Delete('runs/:id')
  discard(@Param('id') id: string) {
    return this.payroll.discard(id);
  }
}
