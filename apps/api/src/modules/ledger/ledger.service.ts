import { Injectable, Logger } from '@nestjs/common';
import {
  LedgerAccount,
  LedgerDirection,
  PaymentMode,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { tenantId } from '../../common/tenancy/tenant-context';

/** What a source row says about the money it moved. */
export interface Posting {
  /** The table and row that caused it. Unique together, so posting twice is safe. */
  sourceType: string;
  sourceId: string;
  at: Date;
  direction: LedgerDirection;
  account: LedgerAccount;
  /** Signed: a correction posts the negative of what it takes back. */
  amount: number;
  voucher: string;
  orderId?: string | null;
  clientId?: string | null;
  party?: string | null;
  accountHead?: string | null;
  taxAmount?: number | null;
  gstin?: string | null;
  reference?: string | null;
  note?: string | null;
  recordedById?: string | null;
}

/** How a receipt's mode decides which account it landed in. */
export function accountFor(mode: PaymentMode): LedgerAccount {
  return mode === PaymentMode.CASH ? LedgerAccount.CASH : LedgerAccount.BANK;
}

/**
 * Where every rupee is recorded, whatever moved it.
 *
 * One posting layer under the money tables rather than a screen that knows how
 * to add up four of them. The point is not tidiness: it is that a module which
 * does not post is visibly missing from Transactions and from the reports,
 * instead of quietly missing from the books.
 *
 * Posting never fails the thing that caused it. A payment that was taken has
 * been taken; if the ledger row cannot be written the failure is logged and
 * the nightly reconcile picks it up, because refusing the payment would be a
 * worse answer than a late row.
 */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger('Ledger');

  constructor(private readonly prisma: PrismaService) {}

  async post(entry: Posting): Promise<void> {
    try {
      await this.write(entry);
    } catch (error) {
      this.logger.error(
        `Could not post ${entry.sourceType} ${entry.sourceId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** The same, but the caller wants to know. Used by the reconcile. */
  async write(entry: Posting): Promise<void> {
    const data = {
      tenantId: tenantId(),
      at: entry.at,
      direction: entry.direction,
      account: entry.account,
      amount: new Prisma.Decimal(entry.amount),
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      orderId: entry.orderId ?? null,
      clientId: entry.clientId ?? null,
      party: entry.party ?? null,
      accountHead: entry.accountHead ?? null,
      voucher: entry.voucher,
      taxAmount: entry.taxAmount == null ? null : new Prisma.Decimal(entry.taxAmount),
      gstin: entry.gstin ?? null,
      reference: entry.reference ?? null,
      note: entry.note ?? null,
      recordedById: entry.recordedById ?? null,
    };

    /*
     * Upsert rather than create: the same source posted twice is the same
     * money, and a reconcile that had to guess whether a row already existed
     * would either double-count or skip.
     */
    await this.prisma.ledgerEntry.upsert({
      where: {
        tenantId_sourceType_sourceId: {
          tenantId: tenantId(),
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
        },
      },
      create: data,
      update: data,
    });
  }

  /**
   * What is in the drawer.
   *
   * Cash that came in, less cash that went out, less cash walked to the bank.
   * A signed amount means a reversed receipt subtracts itself and nothing here
   * has to know about corrections.
   */
  async cashInHand(): Promise<number> {
    const [received, spent, banked] = await Promise.all([
      this.sum({ direction: LedgerDirection.IN, account: LedgerAccount.CASH }),
      this.sum({ direction: LedgerDirection.OUT, account: LedgerAccount.CASH }),
      this.sum({ direction: LedgerDirection.TRANSFER, account: LedgerAccount.CASH }),
    ]);
    return round2(received - spent - banked);
  }

  private async sum(where: Prisma.LedgerEntryWhereInput): Promise<number> {
    const result = await this.prisma.ledgerEntry.aggregate({ where, _sum: { amount: true } });
    return Number(result._sum.amount ?? 0);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
