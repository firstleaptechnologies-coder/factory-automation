import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
import { normalisePhone } from '@fas/shared';
import { tenantId } from '../../common/tenancy/tenant-context';

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
        // Enough for a picker to prefill the addresses on a quote without a
        // second round trip the moment somebody is chosen.
        address: true,
        billingAddress: true,
        shippingAddress: true,
        locations: {
          orderBy: { useCount: 'desc' },
          take: 5,
          select: { id: true, name: true, address: true },
        },
      },
    });
  }

  /**
   * Create the client somebody typed in — unless we already know them.
   *
   * Every screen that captures a client lets you add one without leaving it,
   * which is the right trade for speed but will quietly fill the database with
   * duplicate "Verma Interiors" rows as different people take the same
   * customer's work. A phone number is the one thing that is reliably the same
   * person in this trade, so an exact match reuses the existing client instead
   * of making another. Name collisions are left alone: two different clients
   * genuinely can share a name.
   *
   * It lives here rather than on any one caller because punching an order and
   * writing a quote must land on the same client, and two copies of this rule
   * would drift into two answers.
   */
  async resolveInline(
    tx: Prisma.TransactionClient,
    dto: CreateClientDto,
    userId?: string,
  ): Promise<string> {
    const phone = dto.phone?.replace(/\D/g, '');

    if (phone && phone.length >= 7) {
      const existing = await tx.client.findFirst({
        where: { isActive: true, phone: { contains: phone.slice(-10) } },
        select: { id: true },
      });
      if (existing) return existing.id;
    }

    const created = await tx.client.create({
      data: {
        ...dto,
        tenantId: tenantId(),
        code: await this.codes.next('client', tx),
        createdById: userId,
      },
    });
    return created.id;
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

  /**
   * A client is where a firm's money history lives, so the same firm existing
   * twice is not untidiness — it is a ledger split in half, an outstanding
   * balance that reads as two smaller ones, and a statement that is wrong on
   * both records.
   *
   * The phone number is what a shop actually identifies a client by, and the
   * address book makes a duplicate a single mistaken tap. So a second active
   * client on a number already in use is refused, and the refusal names the
   * one that exists — the caller wanted that client, and can now open it.
   */
  async create(dto: CreateClientDto, userId?: string) {
    const phone = normalisePhone(dto.phone);
    if (phone) {
      const existing = await this.prisma.client.findFirst({
        where: { isActive: true, phone },
        select: { id: true, name: true, code: true, phone: true },
      });
      if (existing) {
        throw new ConflictException({
          message: `${existing.name} (${existing.code}) already has this number.`,
          existing,
        });
      }
    }

    const code = await this.codes.next('client');
    return this.prisma.client.create({
      data: { ...dto, phone, code, tenantId: tenantId(), createdById: userId },
    });
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.findOne(id);

    // Editing a number onto a client that another client already has merges
    // nothing and splits everything, exactly as creating the duplicate would.
    const data = { ...dto };
    if (dto.phone !== undefined) {
      const phone = normalisePhone(dto.phone);
      data.phone = phone;
      if (phone) {
        const clash = await this.prisma.client.findFirst({
          where: { isActive: true, phone, id: { not: id } },
          select: { id: true, name: true, code: true, phone: true },
        });
        if (clash) {
          throw new ConflictException({
            message: `${clash.name} (${clash.code}) already has this number.`,
            existing: clash,
          });
        }
      }
    }

    return this.prisma.client.update({ where: { id }, data });
  }

  async addLocation(clientId: string, dto: AddLocationDto) {
    await this.findOne(clientId);
    return this.prisma.clientLocation.upsert({
      where: { clientId_name: { clientId, name: dto.name } },
      update: { address: dto.address },
      create: { tenantId: tenantId(), clientId, name: dto.name, address: dto.address },
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
