import {
  lineTotal,
  needsReorder,
  onHand,
  purchaseTotals,
  signedQuantity,
  value,
  wasteSummary,
} from './stock';

const move = (kind: string, quantity: number, rate?: number) =>
  ({ kind: kind as never, quantity, rate }) as never;

describe('what is on the rack', () => {
  it('is the sum of the moves, and only that', () => {
    // No level anybody can type over: a quantity that can be overwritten is a
    // quantity with no explanation behind it.
    expect(onHand([move('RECEIPT', 20), move('CONSUMPTION', -6)])).toBe(14);
  });

  it('puts a usable offcut back', () => {
    expect(onHand([move('RECEIPT', 10), move('CONSUMPTION', -4), move('OFFCUT', 1.5)])).toBe(
      7.5,
    );
  });

  it('takes waste and returns off', () => {
    expect(onHand([move('RECEIPT', 10), move('WASTE', -2), move('RETURN', -1)])).toBe(7);
  });

  it('lets a count go either way', () => {
    // A stocktake can find more than the books say, or less.
    expect(onHand([move('RECEIPT', 10), move('ADJUSTMENT', -1)])).toBe(9);
    expect(onHand([move('RECEIPT', 10), move('ADJUSTMENT', 2)])).toBe(12);
  });

  it('refuses to let a wrongly signed consumption add stock', () => {
    // Written positive by mistake, it would silently put sheets on the rack.
    expect(signedQuantity(move('CONSUMPTION', 6))).toBe(-6);
    expect(signedQuantity(move('RECEIPT', -6))).toBe(6);
  });

  it('counts to three decimals, because a kilo is not a sheet', () => {
    expect(onHand([move('RECEIPT', 12.5), move('CONSUMPTION', -0.125)])).toBe(12.375);
  });

  it('answers nothing for a material nobody has bought', () => {
    expect(onHand([])).toBe(0);
  });
});

describe('what the rack is worth', () => {
  it('values it at what was actually paid', () => {
    expect(value([move('RECEIPT', 10, 900)])).toMatchObject({ quantity: 10, value: 9000 });
  });

  it('carries two prices for two deliveries', () => {
    // A rack holding sheets bought at two prices is worth two prices;
    // averaging at the door loses the only figure an accountant wants.
    const rack = value([move('RECEIPT', 10, 900), move('RECEIPT', 10, 1100)]);
    expect(rack).toMatchObject({ quantity: 20, value: 20000, averageRate: 1000 });
  });

  it('takes what leaves out at the average of what is there', () => {
    const rack = value([
      move('RECEIPT', 10, 900),
      move('RECEIPT', 10, 1100),
      move('CONSUMPTION', -5),
    ]);
    expect(rack).toMatchObject({ quantity: 15, value: 15000 });
  });

  it('values an offcut rather than writing it off', () => {
    // At zero, the remainder of every sheet would quietly leave the books.
    const rack = value([move('RECEIPT', 10, 1000), move('CONSUMPTION', -4), move('OFFCUT', 1)]);
    expect(rack.quantity).toBe(7);
    expect(rack.value).toBe(7000);
  });

  it('is worth nothing once it is empty', () => {
    const rack = value([move('RECEIPT', 10, 1000), move('CONSUMPTION', -10)]);
    expect(rack).toMatchObject({ quantity: 0, value: 0, averageRate: 0 });
  });

  it('never reports a negative worth', () => {
    const rack = value([move('RECEIPT', 5, 1000), move('CONSUMPTION', -8)]);
    expect(rack.value).toBe(0);
  });
});

describe('what became of what left the rack', () => {
  const cutting = [
    move('CONSUMPTION', -10),
    move('OFFCUT', 2),
    move('WASTE', -1.5),
    move('RECEIPT', 40),
  ];

  it('measures waste against what was issued, not what was bought', () => {
    /*
     * A shop that buys a hundred sheets and cuts ten has wasted a share of
     * ten. Dividing by a hundred would make every month look better the more
     * it ordered, which is exactly backwards.
     */
    expect(wasteSummary(cutting)).toMatchObject({ consumed: 10, wasted: 1.5, wastePct: 15 });
  });

  it('does not count an offcut as waste', () => {
    // It went back on the rack and will be cut again; counting it as loss
    // would double-count it the day it is used.
    expect(wasteSummary(cutting).offcut).toBe(2);
    expect(wasteSummary(cutting).wasted).toBe(1.5);
  });

  it('answers zero rather than dividing by nothing', () => {
    expect(wasteSummary([move('RECEIPT', 10)])).toMatchObject({ consumed: 0, wastePct: 0 });
  });
});

describe('when to order again', () => {
  it('says so at the level, not below it', () => {
    // A shop that set four meant "order when there are four left"; waiting for
    // three is a day late.
    expect(needsReorder(4, 4)).toBe(true);
    expect(needsReorder(5, 4)).toBe(false);
    expect(needsReorder(0, 4)).toBe(true);
  });

  it('watches nothing nobody asked it to watch', () => {
    expect(needsReorder(0, null)).toBe(false);
    expect(needsReorder(0, 0)).toBe(false);
  });
});

describe('what a purchase comes to', () => {
  it('adds the tax the vendor wrote, not the tax we would have worked out', () => {
    // A vendor's arithmetic is what the shop owes.
    expect(lineTotal({ quantity: 10, rate: 900, taxAmount: 1620 })).toBe(10620);
  });

  it('copes with a line that carries no tax', () => {
    expect(lineTotal({ quantity: 3, rate: 250 })).toBe(750);
  });

  it('totals the lines and whatever else is on the bill', () => {
    expect(
      purchaseTotals(
        [
          { quantity: 10, rate: 900, taxAmount: 1620 },
          { quantity: 5, rate: 200, taxAmount: 180 },
        ],
        350,
      ),
    ).toEqual({ subtotal: 10000, taxTotal: 1800, total: 12150 });
  });

  it('totals an empty bill to nothing', () => {
    expect(purchaseTotals([])).toEqual({ subtotal: 0, taxTotal: 0, total: 0 });
  });
});
