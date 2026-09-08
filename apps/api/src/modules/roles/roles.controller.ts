import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { PERMISSIONS } from '@decor/shared';
import { RolesService } from './roles.service';
import { AssignRoleDto, RoleDto } from './dto/role.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

/**
 * What each kind of person here may do.
 *
 * No module gate: every workspace has roles whatever it has bought, and a
 * workspace that could not manage them would be one nobody could take a
 * permission away in.
 */
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** Readable by anybody who may see the staff list — a role is not a secret. */
  @RequirePermissions(PERMISSIONS.USER_VIEW)
  @Get()
  list() {
    return this.roles.list();
  }

  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @Post()
  create(@Body() dto: RoleDto) {
    return this.roles.create(dto);
  }

  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: RoleDto) {
    return this.roles.update(id, dto);
  }

  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.roles.remove(id);
  }

  /** Puts somebody on a role, or takes their role away. */
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @Patch('users/:userId')
  assign(@Param('userId') userId: string, @Body() dto: AssignRoleDto) {
    return this.roles.assign(userId, dto);
  }
}
