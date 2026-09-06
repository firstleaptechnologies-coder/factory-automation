import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import {
  CreateMaterialCategoryDto,
  CreateMaterialDto,
  MaterialQueryDto,
  UpdateMaterialDto,
} from './dto/material.dto';

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  listCategories() {
    return this.prisma.materialCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { materials: true } } },
    });
  }

  createCategory(dto: CreateMaterialCategoryDto) {
    return this.prisma.materialCategory.create({ data: dto });
  }

  async list(query: MaterialQueryDto): Promise<Paginated<unknown>> {
    const where: Prisma.MaterialWhereInput = {
      isActive: true,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { code: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.material.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { name: 'asc' },
        include: { category: { select: { id: true, code: true, name: true } } },
      }),
      this.prisma.material.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  async findOne(id: string) {
    const material = await this.prisma.material.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!material) throw new NotFoundException(`Material ${id} not found`);
    return material;
  }

  create(dto: CreateMaterialDto) {
    return this.prisma.material.create({ data: dto });
  }

  async update(id: string, dto: UpdateMaterialDto) {
    await this.findOne(id);
    return this.prisma.material.update({ where: { id }, data: dto });
  }

  /** Materials are never hard-deleted — stock ledger rows reference them forever. */
  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.material.update({ where: { id }, data: { isActive: false } });
  }
}
