import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ConfigurationService } from './config.service';
import {
  CreateMaterialDto,
  CreateSizePresetDto,
  ThicknessDto,
  UpdateMaterialDto,
  UpdateSizePresetDto,
} from './dto/config.dto';
import { Roles } from '../../common/decorators/roles.decorator';

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

  @Get('settings')
  getSettings() {
    return this.config.getSettings();
  }

  // Writes are admin-only.

  @Roles(UserRole.ADMIN)
  @Post('materials')
  createMaterial(@Body() dto: CreateMaterialDto) {
    return this.config.createMaterial(dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch('materials/:id')
  updateMaterial(@Param('id') id: string, @Body() dto: UpdateMaterialDto) {
    return this.config.updateMaterial(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Post('materials/:id/thicknesses')
  addThickness(@Param('id') id: string, @Body() dto: ThicknessDto) {
    return this.config.addThickness(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete('thicknesses/:id')
  removeThickness(@Param('id') id: string) {
    return this.config.removeThickness(id);
  }

  @Roles(UserRole.ADMIN)
  @Post('size-presets')
  createSizePreset(@Body() dto: CreateSizePresetDto) {
    return this.config.createSizePreset(dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch('size-presets/:id')
  updateSizePreset(@Param('id') id: string, @Body() dto: UpdateSizePresetDto) {
    return this.config.updateSizePreset(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch('settings/:key')
  setSetting(@Param('key') key: string, @Body('value') value: unknown) {
    return this.config.setSetting(key, value);
  }
}
