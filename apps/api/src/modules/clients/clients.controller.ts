import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ClientsService } from './clients.service';
import {
  AddLocationDto,
  ClientQueryDto,
  CreateClientDto,
  UpdateClientDto,
} from './dto/client.dto';
import { MODULES, PERMISSIONS } from '@decor/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireModule } from '../../common/decorators/module.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@RequireModule(MODULES.CLIENTS)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @RequirePermissions(PERMISSIONS.CLIENT_VIEW)
  @Get()
  list(@Query() query: ClientQueryDto) {
    return this.clients.list(query);
  }

  /** Type-ahead used by the punch screen. */
  @RequirePermissions(PERMISSIONS.CLIENT_VIEW)
  @Get('search')
  search(@Query('q') term: string) {
    return this.clients.search(term ?? '');
  }

  @RequirePermissions(PERMISSIONS.CLIENT_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clients.findOne(id);
  }

  @RequirePermissions(PERMISSIONS.CLIENT_MANAGE)
  @Post()
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthUser) {
    return this.clients.create(dto, user?.id);
  }

  @RequirePermissions(PERMISSIONS.CLIENT_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(id, dto);
  }

  @RequirePermissions(PERMISSIONS.CLIENT_MANAGE)
  @Post(':id/locations')
  addLocation(@Param('id') id: string, @Body() dto: AddLocationDto) {
    return this.clients.addLocation(id, dto);
  }
}
