import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ClientsService } from './clients.service';
import {
  AddLocationDto,
  ClientQueryDto,
  CreateClientDto,
  UpdateClientDto,
} from './dto/client.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(@Query() query: ClientQueryDto) {
    return this.clients.list(query);
  }

  /** Type-ahead used by the punch screen. */
  @Get('search')
  search(@Query('q') term: string) {
    return this.clients.search(term ?? '');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clients.findOne(id);
  }

  @Roles(UserRole.SALES, UserRole.MANAGER)
  @Post()
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthUser) {
    return this.clients.create(dto, user?.id);
  }

  @Roles(UserRole.SALES, UserRole.MANAGER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(id, dto);
  }

  @Roles(UserRole.SALES, UserRole.MANAGER)
  @Post(':id/locations')
  addLocation(@Param('id') id: string, @Body() dto: AddLocationDto) {
    return this.clients.addLocation(id, dto);
  }
}
