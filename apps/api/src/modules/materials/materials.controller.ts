import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { MaterialsService } from './materials.service';
import {
  CreateMaterialCategoryDto,
  CreateMaterialDto,
  MaterialQueryDto,
  UpdateMaterialDto,
} from './dto/material.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('materials')
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  @Get('categories')
  listCategories() {
    return this.materials.listCategories();
  }

  @Roles(UserRole.MANAGER)
  @Post('categories')
  createCategory(@Body() dto: CreateMaterialCategoryDto) {
    return this.materials.createCategory(dto);
  }

  @Get()
  list(@Query() query: MaterialQueryDto) {
    return this.materials.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.materials.findOne(id);
  }

  @Roles(UserRole.MANAGER, UserRole.STORE)
  @Post()
  create(@Body() dto: CreateMaterialDto) {
    return this.materials.create(dto);
  }

  @Roles(UserRole.MANAGER, UserRole.STORE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMaterialDto) {
    return this.materials.update(id, dto);
  }

  @Roles(UserRole.MANAGER)
  @Delete(':id')
  deactivate(@Param('id') id: string) {
    return this.materials.deactivate(id);
  }
}
