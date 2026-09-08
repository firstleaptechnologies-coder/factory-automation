import { StockMoveKind } from '@prisma/client';

/**
 * What is on the rack, and what became of what was not.
 *
 * Pure, and separate from the service for the same reason the payroll
 * arithmetic is: a shop that thinks it has four sheets and finds three will
 * work this out on paper, and the rules had better be readable.
 *
 * Everything here follows from one decision — that a level is never set, only
 * summed. A quantity somebody can type over is a quantity with no explanation
 * behind it, and "where did four sheets go" is the question this module exists
 * to answer.
 */

/** Three decimals: a sheet is counted whole, a kilo is not. */
export function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/** Two decimals, the way money is written. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Which way a kind of move pushes the rack. */
export const ADDS_TO_STOCK: Record<StockMoveKind, boolean> = {
  RECEIPT: true,
  /// The usable remainder of a sheet goes back on the rack.
  OFFCUT: true,
  CONSUMPTION: false,
  WASTE: false,
  RETURN: false,
  /// An adjustment carries its own sign: a count can find more or less.
  ADJUSTMENT: true,
};

export interface Move {
  kind: StockMoveKind;
  quantity: number;
  rate?: number | null;
}

/**
 * The signed quantity a move contributes.
 *
 * Stored signed already — a consumption is written as a negative — so this is
 * a guard rather than a conversion: a positive consumption would silently add
 * stock, and the one place to catch that is here.
 */
export function signedQuantity(move: Move): number {
  const magnitude = Math.abs(move.quantity);
  if (move.kind === StockMoveKind.ADJUSTMENT) return round3(move.quantity);
  return round3(ADDS_TO_STOCK[move.kind] ? magnitude : -magnitude);
}

/** What is on the rack, from every move ever made against it. */
export function onHand(moves: Move[]): number {
  return round3(moves.reduce((total, move) => total + signedQuantity(move), 0));
}

export interface Valuation {
  quantity: number;
  /** What the rack is worth, at what the shop actually paid. */
  value: number;
  /** The average of what it paid, for a figure a report can carry. */
  averageRate: number;
}

/**
 * What the rack is worth.
 *
 * Weighted by what was actually paid for each delivery rather than by a rate
 * on the material, because a rack holding sheets bought at two prices is worth
 * two prices. Moves with no rate — an offcut, a count — take the average of
 * what came before them rather than nothing: an offcut valued at zero would
 * quietly write the remainder of every sheet off the books.
 */
export function value(moves: Move[]): Valuation {
  let quantity = 0;
  let worth = 0;

  for (const move of moves) {
    const signed = signedQuantity(move);
    const average = quantity > 0 ? worth / quantity : 0;
    const rate = move.rate ?? average;

    quantity = round3(quantity + signed);
    worth = round2(worth + signed * rate);

    // A rack that has gone empty is worth nothing, whatever the arithmetic of
    // the rates that emptied it says.
    if (quantity <= 0.0005) {
      quantity = Math.max(0, quantity);
      worth = quantity === 0 ? 0 : worth;
    }
  }

  return {
    quantity: round3(quantity),
    value: round2(Math.max(0, worth)),
    averageRate: quantity > 0 ? round2(worth / quantity) : 0,
  };
}

export interface WasteSummary {
  /** What was issued to be cut. */
  consumed: number;
  /** What came back usable. */
  offcut: number;
  /** What was cut away and gone. */
  wasted: number;
  /** Waste as a share of what was issued, 0–100. */
  wastePct: number;
}

/**
 * What became of the material that left the rack.
 *
 * The number the owner cannot see today. Waste is measured against what was
 * *issued*, not against what was bought: a shop that buys a hundred sheets and
 * cuts ten has wasted a share of ten, and dividing by a hundred would make
 * every month look better the more it ordered.
 *
 * An offcut is not waste. It went back on the rack and will be cut again, so
 * counting it as loss would double-count it the day it is used.
 */
export function wasteSummary(moves: Move[]): WasteSummary {
  const total = (kind: StockMoveKind) =>
    round3(
      moves
        .filter((move) => move.kind === kind)
        .reduce((sum, move) => sum + Math.abs(move.quantity), 0),
    );

  const consumed = total(StockMoveKind.CONSUMPTION);
  const offcut = total(StockMoveKind.OFFCUT);
  const wasted = total(StockMoveKind.WASTE);

  return {
    consumed,
    offcut,
    wasted,
    wastePct: consumed > 0 ? round2((wasted / consumed) * 100) : 0,
  };
}

/**
 * Whether a material needs ordering.
 *
 * At the level, not below it: a shop that set the level at four meant "order
 * when there are four left", and waiting for three is a day late.
 */
export function needsReorder(
  quantity: number,
  reorderLevel?: number | null,
): boolean {
  if (reorderLevel == null || reorderLevel <= 0) return false;
  return quantity <= reorderLevel;
}

/**
 * What a purchase line comes to.
 *
 * The tax is taken from the bill rather than derived from the rate, because a
 * vendor's arithmetic is what the shop owes whatever this would have
 * calculated. What is computed here is only the part nobody writes down.
 */
export function lineTotal(input: {
  quantity: number;
  rate: number;
  taxAmount?: number | null;
}): number {
  return round2(input.quantity * input.rate + (input.taxAmount ?? 0));
}

/** What a whole purchase comes to, from its lines and whatever else is on it. */
export function purchaseTotals(
  items: { quantity: number; rate: number; taxAmount?: number | null }[],
  otherCharges = 0,
): { subtotal: number; taxTotal: number; total: number } {
  const subtotal = round2(
    items.reduce((sum, item) => sum + item.quantity * item.rate, 0),
  );
  const taxTotal = round2(items.reduce((sum, item) => sum + (item.taxAmount ?? 0), 0));
  return {
    subtotal,
    taxTotal,
    total: round2(subtotal + taxTotal + otherCharges),
  };
}
