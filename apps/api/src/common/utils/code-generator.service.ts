import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tenantId } from '../tenancy/tenant-context';

type Sequenced = 'order' | 'client' | 'lead';

const PREFIX: Record<Sequenced, string> = {
  order: 'ORD',
  client: 'CL',
  lead: 'LD',
};

type Client = PrismaService | Prisma.TransactionClient;

/**
 * Human-readable document numbers (ORD-2526-0001). The financial-year segment
 * is what the shop floor and the accountant both expect to see on paper.
 *
 * Numbers come from an atomic counter row rather than "max existing + 1", so
 * concurrent callers cannot collide. Counters are per tenant, so two businesses
 * on the platform both start at 0001 rather than sharing a sequence.
 */
@Injectable()
export class CodeGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  async next(entity: Sequenced, client?: Client, at = new Date()): Promise<string> {
    const db = client ?? this.prisma;
    const key = `${PREFIX[entity]}-${financialYear(at)}`;
    const value = await this.increment(db, key);
    return `${key}-${String(value).padStart(4, '0')}`;
  }

  private async increment(db: Client, key: string): Promise<number> {
    const tenant = tenantId();
    const where = { tenantId_key: { tenantId: tenant, key } };

    try {
      const row = await db.documentSequence.update({
        where,
        data: { value: { increment: 1 } },
        select: { value: true },
      });
      return row.value;
    } catch (error) {
      if (!isMissingRecord(error)) throw error;
    }

    try {
      const row = await db.documentSequence.create({
        data: { tenantId: tenant, key, value: 1 },
        select: { value: true },
      });
      return row.value;
    } catch (error) {
      // Someone created the counter between our update and our create.
      if (!isUniqueViolation(error)) throw error;
      const row = await db.documentSequence.update({
        where,
        data: { value: { increment: 1 } },
        select: { value: true },
      });
      return row.value;
    }
  }
}

function isMissingRecord(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

/** Indian FY: April to March, rendered as 2526 for 2025-26. */
export function financialYear(date: Date): string {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  return `${String(startYear).slice(2)}${String(startYear + 1).slice(2)}`;
}
