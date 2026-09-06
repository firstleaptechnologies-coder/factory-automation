import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { WasteService } from './waste.service';
import {
  CreateWasteRecordDto,
  UpdateDispositionDto,
  WasteQueryDto,
} from './dto/waste.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('waste')
export class WasteController {
  constructor(private readonly waste: WasteService) {}

  @Get()
  list(@Query() query: WasteQueryDto) {
    return this.waste.list(query);
  }

  @Get('analytics')
  analytics(@Query() query: WasteQueryDto) {
    return this.waste.analytics(query);
  }

  @Get('offcut-inventory')
  offcutInventory() {
    return this.waste.offcutInventory();
  }

  @Roles(UserRole.OPERATOR, UserRole.STORE, UserRole.QC, UserRole.MANAGER)
  @Post()
  create(@Body() dto: CreateWasteRecordDto, @CurrentUser() user: AuthUser) {
    return this.waste.create(dto, user?.id);
  }

  @Roles(UserRole.STORE, UserRole.MANAGER)
  @Patch(':id/disposition')
  setDisposition(@Param('id') id: string, @Body() dto: UpdateDispositionDto) {
    return this.waste.setDisposition(id, dto);
  }
}
