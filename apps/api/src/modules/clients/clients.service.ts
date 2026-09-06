import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';
import { paginate } from '../../common/dto/pagination.dto';
import {
  AddLocationDto,
  ClientQueryDto,
  CreateClientDto,
  UpdateClientDto,
} from './dto/client.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodeGeneratorService,
  ) {}

  async list(query: ClientQueryDto) {
    const where = this.buildWhere(query.search);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { name: 'asc' },
        include: { _count: { select: { orders: true } } },
      }),
      this.prisma.client.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  /**
   * Type-ahead for the punch screen. Deliberately small and cheap: the operator
   * is mid-order and wants the right client in two keystrokes, not a page of
   * results.
   */
  async search(term: string, limit = 8) {
    if (!term?.trim()) return [];
    return this.prisma.client.findMany({
      where: this.buildWhere(term),
      take: limit,
      orderBy: [{ orders: { _count: 'desc' } }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        phone: true,
        company: true,
        locations: {
          orderBy: { useCount: 'desc' },
          take: 5,
          select: { id: true, name: true, address: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        locations: { orderBy: { useCount: 'desc' } },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 25,
          include: { status: { select: { id: true, name: true, color: true } } },
        },
      },
    });
    if (!client) throw new NotFoundException(`Client ${id} not found`);
    return client;
  }

  async create(dto: CreateClientDto, userId?: string) {
    const code = await this.codes.next('client');
    return this.prisma.client.create({
      data: { ...dto, code, createdById: userId },
    });
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.findOne(id);
    return this.prisma.client.update({ where: { id }, data: dto });
  }

  async addLocation(clientId: string, dto: AddLocationDto) {
    await this.findOne(clientId);
    return this.prisma.clientLocation.upsert({
      where: { clientId_name: { clientId, name: dto.name } },
      update: { address: dto.address },
      create: { clientId, name: dto.name, address: dto.address },
    });
  }

  private buildWhere(search?: string): Prisma.ClientWhereInput {
    if (!search?.trim()) return { isActive: true };
    const term = search.trim();
    return {
      isActive: true,
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { company: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
        { code: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ],
    };
  }
}
