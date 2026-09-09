import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { MODULES, PERMISSIONS } from '@fas/shared';
import { EmployeesService } from './employees.service';
import { EmployeeDto, EmployeeQueryDto } from './dto/employee.dto';
import { LeftDto } from './dto/left.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireModule } from '../../common/decorators/module.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@RequireModule(MODULES.HR)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @RequirePermissions(PERMISSIONS.EMPLOYEE_VIEW)
  @Get()
  list(@Query() query: EmployeeQueryDto) {
    return this.employees.list(query);
  }

  @RequirePermissions(PERMISSIONS.EMPLOYEE_VIEW)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.employees.get(id);
  }

  /**
   * The full Aadhaar, PAN and account number.
   *
   * Its own route and its own permission, so reading them is a deliberate act
   * with a line in the audit trail rather than a side effect of opening a
   * screen.
   */
  @RequirePermissions(PERMISSIONS.EMPLOYEE_IDENTIFIERS)
  @Get(':id/identifiers')
  identifiers(@Param('id') id: string) {
    return this.employees.identifiers(id);
  }

  @RequirePermissions(PERMISSIONS.EMPLOYEE_MANAGE)
  @Post()
  create(@Body() dto: EmployeeDto, @CurrentUser() user?: AuthUser) {
    return this.employees.create(dto, user?.id);
  }

  @RequirePermissions(PERMISSIONS.EMPLOYEE_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: EmployeeDto) {
    return this.employees.update(id, dto);
  }

  /** Somebody has left. The row stays; their login is switched off. */
  @RequirePermissions(PERMISSIONS.EMPLOYEE_MANAGE)
  @Post(':id/left')
  markLeft(@Param('id') id: string, @Body() dto: LeftDto) {
    return this.employees.markLeft(id, dto.leftOn);
  }
}
