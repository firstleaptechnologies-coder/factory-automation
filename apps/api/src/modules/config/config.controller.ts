import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ConfigurationService } from './config.service';
import {
  CreateMaterialDto,
  GstSlabDto,
  UpdateGstSlabDto,
  CreateSizePresetDto,
  ThicknessDto,
  UpdateMaterialDto,
  UpdateSizePresetDto,
} from './dto/config.dto';
import { PERMISSIONS } from '@fas/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@Controller('config')
export class ConfigurationController {
  constructor(private readonly config: ConfigurationService) {}

  // Reads are open to any signed-in user — the punch screen needs them.

  @Get('materials')
  listMaterials(@Query('includeInactive') includeInactive?: string) {
    return this.config.listMaterials(includeInactive === 'true');
  }

  @Get('size-presets')
  listSizePresets(@Query('includeInactive') includeInactive?: string) {
    return this.config.listSizePresets(includeInactive === 'true');
  }

  @Get('gst-slabs')
  listGstSlabs(@Query('includeInactive') includeInactive?: string) {
    return this.config.listGstSlabs(includeInactive === 'true');
  }

  @Get('settings')
  getSettings() {
    return this.config.getSettings();
  }

  // Writes are admin-only.

  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @Post('materials')
  createMaterial(@Body() dto: CreateMaterialDto) {
    return this.config.createMaterial(dto);
  }

  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @Patch('materials/:id')
  updateMaterial(@Param('id') id: string, @Body() dto: UpdateMaterialDto) {
    return this.config.updateMaterial(id, dto);
  }

  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @Post('materials/:id/thicknesses')
  addThickness(@Param('id') id: string, @Body() dto: ThicknessDto) {
    return this.config.addThickness(id, dto);
  }

  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @Delete('thicknesses/:id')
  removeThickness(@Param('id') id: string) {
    return this.config.removeThickness(id);
  }

  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @Post('size-presets')
  createSizePreset(@Body() dto: CreateSizePresetDto) {
    return this.config.createSizePreset(dto);
  }

  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @Patch('size-presets/:id')
  updateSizePreset(@Param('id') id: string, @Body() dto: UpdateSizePresetDto) {
    return this.config.updateSizePreset(id, dto);
  }

  @RequirePermissions(PERMISSIONS.GST_MANAGE)
  @Post('gst-slabs')
  createGstSlab(@Body() dto: GstSlabDto) {
    return this.config.createGstSlab(dto);
  }

  @RequirePermissions(PERMISSIONS.GST_MANAGE)
  @Patch('gst-slabs/:id')
  updateGstSlab(@Param('id') id: string, @Body() dto: UpdateGstSlabDto) {
    return this.config.updateGstSlab(id, dto);
  }

  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  @Patch('settings/:key')
  setSetting(@Param('key') key: string, @Body('value') value: unknown) {
    return this.config.setSetting(key, value);
  }
}
