import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ChangePasswordDto, CreateUserDto, UpdateUserDto } from './dto/user.dto';

const SAFE_FIELDS = {
  id: true,
  code: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      select: SAFE_FIELDS,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SAFE_FIELDS });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async create(dto: CreateUserDto) {
    const { password, ...rest } = dto;
    return this.prisma.user.create({
      data: { ...rest, passwordHash: await AuthService.hash(password) },
      select: SAFE_FIELDS,
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: dto, select: SAFE_FIELDS });
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash: await AuthService.hash(dto.password) },
      select: SAFE_FIELDS,
    });
  }
}
