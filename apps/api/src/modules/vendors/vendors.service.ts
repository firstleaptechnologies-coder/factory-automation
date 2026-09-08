import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';
import { tenantId } from '../../common/tenancy/tenant-context';
import { paginate } from '../../common/dto/pagination.dto';
import { VendorDto, VendorQueryDto } from './dto/vendor.dto';

/**
 * Everybody the shop buys from.
 *
 * A separate model from `Client` although the columns rhyme. The same firm is
 * occasionally both — a fabricator who supplies board and also orders panels —
 * and merging them would give one screen listing everybody the shop deals with
 * in either direction, with no way to say which way.
 */
@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodeGeneratorService,
  ) {}

  async list(query: VendorQueryDto) {
    const where = vendorFilter(query);

    const [rows, count] = await Promise.all([
      this.prisma.vendor.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        skip: query.skip,
        take: query.limit,
        include: { _count: { select: { purchases: true } } },
      }),
      this.prisma.vendor.count({ where }),
    ]);

    return paginate(rows, count, { page: query.page, limit: query.limit });
  }

  async get(id: string) {
    const row = await this.prisma.vendor.findFirst({
      where: { id },
      include: { _count: { select: { purchases: true } } },
    });
    if (!row) throw new NotFoundException('Vendor not found');
    return row;
  }

  async create(dto: VendorDto, userId?: string) {
    return this.prisma.vendor.create({
      data: {
        tenantId: tenantId(),
        code: await this.codes.next('vendor'),
        ...rowFrom(dto),
        createdById: userId,
      },
      include: { _count: { select: { purchases: true } } },
    });
  }

  async update(id: string, dto: VendorDto) {
    const vendor = await this.prisma.vendor.findFirst({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    return this.prisma.vendor.update({
      where: { id },
      data: { ...rowFrom(dto), isActive: dto.isActive ?? vendor.isActive },
      include: { _count: { select: { purchases: true } } },
    });
  }

  /**
   * Retired, not deleted.
   *
   * Every purchase ever placed hangs off this row, and an accountant asked
   * about a bill from two years ago wants a name rather than an id.
   */
  async retire(id: string) {
    const vendor = await this.prisma.vendor.findFirst({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (!vendor.isActive) throw new BadRequestException('That vendor is already retired');

    return this.prisma.vendor.update({
      where: { id },
      data: { isActive: false },
      include: { _count: { select: { purchases: true } } },
    });
  }
}

/** The columns a vendor is written from, whichever way they arrived. */
export function rowFrom(dto: VendorDto) {
  return {
    name: dto.name.trim(),
    phone: dto.phone?.trim() || null,
    altPhone: dto.altPhone?.trim() || null,
    email: dto.email?.trim() || null,
    gstin: dto.gstin?.trim().toUpperCase() || null,
    company: dto.company?.trim() || null,
    stateCode: dto.stateCode?.trim() || null,
    stateName: dto.stateName?.trim() || null,
    address: dto.address?.trim() || null,
    notes: dto.notes?.trim() || null,
    supplies: dto.supplies?.trim() || null,
    paymentTermDays: dto.paymentTermDays ?? null,
  };
}

/**
 * The vendors one view covers.
 *
 * Retired ones are out of the way unless they are asked for: the list is
 * nearly always "who can we order from", not "who ever supplied us".
 */
export function vendorFilter(query: {
  includeInactive?: boolean;
  search?: string;
}): Prisma.VendorWhereInput {
  const search = query.search?.trim();
  const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

  return {
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(search
      ? {
          OR: [
            { name: contains(search) },
            { code: contains(search) },
            { phone: contains(search) },
            { company: contains(search) },
            { supplies: contains(search) },
          ],
        }
      : {}),
  };
}
