import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { MODULES, PERMISSIONS } from '@fas/shared';
import { VendorsService } from './vendors.service';
import { VendorDto, VendorQueryDto } from './dto/vendor.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireModule } from '../../common/decorators/module.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@RequireModule(MODULES.PURCHASING)
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @RequirePermissions(PERMISSIONS.VENDOR_VIEW)
  @Get()
  list(@Query() query: VendorQueryDto) {
    return this.vendors.list(query);
  }

  @RequirePermissions(PERMISSIONS.VENDOR_VIEW)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.vendors.get(id);
  }

  @RequirePermissions(PERMISSIONS.VENDOR_MANAGE)
  @Post()
  create(@Body() dto: VendorDto, @CurrentUser() user?: AuthUser) {
    return this.vendors.create(dto, user?.id);
  }

  @RequirePermissions(PERMISSIONS.VENDOR_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: VendorDto) {
    return this.vendors.update(id, dto);
  }

  /** Retires them. Every purchase ever placed still hangs off the row. */
  @RequirePermissions(PERMISSIONS.VENDOR_MANAGE)
  @Delete(':id')
  retire(@Param('id') id: string) {
    return this.vendors.retire(id);
  }
}
