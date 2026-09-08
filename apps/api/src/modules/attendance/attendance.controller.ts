import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { MODULES, PERMISSIONS } from '@decor/shared';
import { AttendanceService } from './attendance.service';
import { DayQueryDto, MarkDayDto, RegisterQueryDto } from './dto/attendance.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireModule } from '../../common/decorators/module.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@RequireModule(MODULES.HR)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  /** Everyone who could be marked on one day, with whatever they were marked. */
  @RequirePermissions(PERMISSIONS.ATTENDANCE_VIEW)
  @Get('day')
  day(@Query() query: DayQueryDto) {
    return this.attendance.day(query);
  }

  @RequirePermissions(PERMISSIONS.ATTENDANCE_VIEW)
  @Get()
  register(@Query() query: RegisterQueryDto) {
    return this.attendance.register(query);
  }

  /** What each person's month came to — the figure a salary run reads. */
  @RequirePermissions(PERMISSIONS.ATTENDANCE_VIEW)
  @Get('summary')
  summary(@Query() query: RegisterQueryDto) {
    return this.attendance.summary(query);
  }

  /**
   * Marks the register for one day.
   *
   * A day at a time rather than a row at a time, because that is how a shop
   * marks it. Marking the same day again corrects it.
   */
  @RequirePermissions(PERMISSIONS.ATTENDANCE_MARK)
  @Post('day')
  markDay(@Body() dto: MarkDayDto, @CurrentUser() user?: AuthUser) {
    return this.attendance.markDay(dto, user?.id);
  }
}
