import { Injectable } from '@nestjs/common';
import type { HistoryEntry, HistoryKind } from '@fas/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/** How far back one screen looks. Enough for an argument, not a data export. */
const LIMIT = 200;

type Row = Record<string, unknown>;

/**
 * Everything that happened to one thing, in one list.
 *
 * Two sources, deliberately. Status moves have their own table because a move
 * carries things a diff cannot — the note, and whether it went backwards — and
 * they were already shown. Everything else comes from the audit trail, which is
 * written underneath every write in the product. Merged here so a person reads
 * one story: moved to Cutting, rate on line 2 corrected, ₹40,000 taken, moved
 * back to Design because the client changed their mind.
 */
@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** An order: its own edits, its lines, its money, and its moves. */
  async forOrder(id: string): Promise<HistoryEntry[]> {
    const [changes, moves] = await Promise.all([
      this.changes('Order', id),
      this.prisma.orderStatusHistory.findMany({
        where: { orderId: id },
        orderBy: { changedAt: 'desc' },
        take: LIMIT,
        include: {
          fromStatus: { select: { name: true } },
          toStatus: { select: { name: true } },
          changedBy: { select: { name: true } },
        },
      }),
    ]);

    return newestFirst([
      // The move row says it better than "stage: <id> → <id>" ever could.
      ...changes.filter((entry) => !isOnlyAStatusMove(entry)),
      ...moves.map((move) => toMove(move as Row, 'Order', id)),
    ]);
  }

  /** An enquiry, the same way. */
  async forLead(id: string): Promise<HistoryEntry[]> {
    const [changes, moves] = await Promise.all([
      this.changes('Lead', id),
      this.prisma.leadStatusHistory.findMany({
        where: { leadId: id },
        orderBy: { changedAt: 'desc' },
        take: LIMIT,
        include: {
          fromStatus: { select: { name: true } },
          toStatus: { select: { name: true } },
          changedBy: { select: { name: true } },
        },
      }),
    ]);

    return newestFirst([
      ...changes.filter((entry) => !isOnlyAStatusMove(entry)),
      ...moves.map((move) => toMove(move as Row, 'Lead', id)),
    ]);
  }

  /** Anything else that has no stages of its own. */
  async forEntity(entity: string, id: string): Promise<HistoryEntry[]> {
    return this.changes(entity, id);
  }

  /**
   * The money on one order.
   *
   * Payments hang off the order rather than standing on their own, so this asks
   * by what they belong to — every receipt taken, corrected or reversed against
   * this order, and nothing else about it.
   */
  async forPayments(orderId: string): Promise<HistoryEntry[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { entity: { in: ['Payment', 'CashDeposit'] }, rootId: orderId },
      orderBy: { createdAt: 'desc' },
      take: LIMIT,
      include: { user: { select: { name: true } } },
    });
    return rows.map((row) => toEntry(row as Row));
  }

  /**
   * The trail for one thing, including whatever hangs off it.
   *
   * `rootId` is what makes an order's history hold the line whose rate was
   * corrected and the payment that was taken, rather than only the order's own
   * columns.
   */
  private async changes(entity: string, id: string): Promise<HistoryEntry[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entity, entityId: id },
          { rootEntity: entity, rootId: id },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: LIMIT,
      include: { user: { select: { name: true } } },
    });

    return rows.map((row) => toEntry(row as Row));
  }
}

function toEntry(row: Row): HistoryEntry {
  const action = String(row.action ?? '');
  const before = (row.before ?? {}) as Row;
  const after = (row.after ?? {}) as Row;

  return {
    id: String(row.id),
    at: (row.createdAt as Date).toISOString(),
    kind: kindOf(action),
    action,
    entity: String(row.entity),
    entityId: String(row.entityId),
    entityCode: (row.entityCode as string | null) ?? null,
    by: ((row.user as Row | null)?.name as string | undefined) ?? (row.actorLabel as string | null) ?? null,
    reason: (row.reason as string | null) ?? null,
    changes: [...new Set([...Object.keys(before), ...Object.keys(after)])].map((field) => ({
      field,
      from: before[field] ?? null,
      to: after[field] ?? null,
    })),
  };
}

function toMove(move: Row, entity: string, id: string): HistoryEntry {
  const from = (move.fromStatus as Row | null)?.name as string | undefined;
  return {
    id: String(move.id),
    at: (move.changedAt as Date).toISOString(),
    kind: 'moved',
    action: move.reversed ? `${entity.toLowerCase()}.moved_back` : `${entity.toLowerCase()}.moved`,
    entity,
    entityId: id,
    by: ((move.changedBy as Row | null)?.name as string | undefined) ?? null,
    reason: (move.note as string | null) ?? null,
    from: from ?? null,
    to: ((move.toStatus as Row | null)?.name as string | undefined) ?? null,
    reversed: Boolean(move.reversed),
  };
}

function kindOf(action: string): HistoryKind {
  if (action.endsWith('.created')) return 'created';
  if (action.endsWith('.deleted')) return 'deleted';
  if (action.includes('moved')) return 'moved';
  return 'changed';
}

/** A row whose only change is the stage it sits in. The move row covers it. */
function isOnlyAStatusMove(entry: HistoryEntry): boolean {
  const fields = (entry.changes ?? []).map((change) => change.field);
  return (
    entry.kind === 'changed' &&
    fields.length > 0 &&
    fields.every((field) => field === 'statusId')
  );
}

function newestFirst(entries: HistoryEntry[]): HistoryEntry[] {
  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, LIMIT);
}
