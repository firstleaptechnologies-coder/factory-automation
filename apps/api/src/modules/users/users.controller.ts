import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PERMISSIONS } from '@decor/shared';
import { UsersService } from './users.service';
import { ChangePasswordDto, CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

/**
 * The logins this workspace has issued.
 *
 * Seeing who has one and issuing one are separate: the roles screen has to
 * list people to put them on a role, and that is not the same permission as
 * being able to create an account.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RequirePermissions(PERMISSIONS.USER_VIEW)
  @Get()
  list() {
    return this.users.list();
  }

  @RequirePermissions(PERMISSIONS.USER_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @Patch(':id/password')
  changePassword(@Param('id') id: string, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(id, dto);
  }
}
