import {
  describeEdit,
  describeHistory,
  editDetail,
  entityLabel,
  fieldLabel,
  historyValue,
  shownChanges,
  type ExpenseEditEntry,
  type HistoryEntry,
} from './history';

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: 'h1',
  at: '2026-09-08T10:00:00.000Z',
  kind: 'changed',
  action: 'order.updated',
  entity: 'Order',
  entityId: 'o1',
  ...over,
});

describe('naming a field', () => {
  it('uses the shop’s word where there is one', () => {
    expect(fieldLabel('gstin')).toBe('GSTIN');
    expect(fieldLabel('statusId')).toBe('Stage');
    expect(fieldLabel('mode')).toBe('Paid by');
  });

  it('makes a fair guess at anything else', () => {
    // Better than showing a column name, and better than a list nobody keeps
    // up to date.
    expect(fieldLabel('amountPaid')).toBe('Amount paid');
    expect(fieldLabel('materialId')).toBe('Material');
  });
});

describe('naming a row', () => {
  it('calls things what the shop calls them', () => {
    expect(entityLabel('OrderItem')).toBe('Line');
    expect(entityLabel('Lead')).toBe('Enquiry');
    expect(entityLabel('Estimate')).toBe('Quote');
    expect(entityLabel('Disbursement')).toBe('Payout');
  });
});

describe('showing a value', () => {
  it('shows an empty one as a dash rather than as nothing', () => {
    expect(historyValue(null)).toBe('—');
    expect(historyValue('')).toBe('—');
  });

  it('shows a date as a date', () => {
    expect(historyValue('2026-09-08T10:00:00.000Z')).toBe('08/09/2026');
  });

  it('shows a flag as a word', () => {
    expect(historyValue(false)).toBe('no');
  });
});

describe('saying what happened', () => {
  it('reads a move as a move', () => {
    expect(describeHistory(entry({ kind: 'moved', from: 'Design', to: 'Cutting' }))).toBe(
      'Design → Cutting',
    );
  });

  it('says when a move went backwards', () => {
    expect(
      describeHistory(entry({ kind: 'moved', from: 'Cutting', to: 'Design', reversed: true })),
    ).toBe('Cutting → Design · went back');
  });

  it('reads the first move as the punch it was', () => {
    expect(describeHistory(entry({ kind: 'moved', from: null, to: 'Order confirmed' }))).toBe(
      'Punched at Order confirmed',
    );
  });

  it('names the one thing that changed', () => {
    expect(
      describeHistory(entry({ changes: [{ field: 'rate', from: 100, to: 150 }] })),
    ).toBe('Rate changed');
  });

  it('counts them when there are several', () => {
    expect(
      describeHistory(
        entry({
          entity: 'OrderItem',
          changes: [
            { field: 'rate', from: 1, to: 2 },
            { field: 'quantity', from: 1, to: 3 },
          ],
        }),
      ),
    ).toBe('2 things changed on the line');
  });

  it('reads an addition and a removal plainly', () => {
    expect(describeHistory(entry({ kind: 'created', entity: 'Payment' }))).toBe('Payment added');
    expect(describeHistory(entry({ kind: 'deleted', entity: 'OrderItem' }))).toBe('Line removed');
  });
});

describe('what is worth showing', () => {
  it('leaves out ids and bookkeeping', () => {
    const shown = shownChanges(
      entry({
        changes: [
          { field: 'id', from: 'a', to: 'b' },
          { field: 'updatedAt', from: 'x', to: 'y' },
          { field: 'rate', from: 100, to: 150 },
        ],
      }),
    );
    expect(shown.map((change) => change.field)).toEqual(['rate']);
  });

  it('says a row was edited when nothing readable changed', () => {
    expect(describeHistory(entry({ changes: [{ field: 'updatedAt', from: 1, to: 2 }] }))).toBe(
      'Order edited',
    );
  });
});

describe('an expense’s own story', () => {
  const edit = (over: Partial<ExpenseEditEntry> = {}): ExpenseEditEntry => ({
    id: 'h1',
    editType: 'UPDATED',
    changes: [],
    createdAt: '2026-09-09T10:00:00Z',
    ...over,
  });

  it('names what happened in one word each', () => {
    expect(describeEdit(edit({ editType: 'CREATED' }))).toBe('Recorded');
    expect(describeEdit(edit({ editType: 'REVERSED' }))).toBe('Taken back');
  });

  it('names the field when one thing changed, and counts when several did', () => {
    expect(
      describeEdit(edit({ changes: [{ field: 'amount', from: 4500, to: 5200 }] })),
    ).toBe('Amount changed');
    expect(
      describeEdit(
        edit({
          changes: [
            { field: 'amount', from: 4500, to: 5200 },
            { field: 'spentType', from: 'Tooling', to: 'Consumables' },
          ],
        }),
      ),
    ).toBe('2 things changed');
  });

  it('says an edit happened even when the change list is missing', () => {
    // A row written before a field was tracked still has to read as something.
    expect(describeEdit(edit())).toBe('Edited');
  });

  it('reads each change as what it went from and to', () => {
    expect(
      editDetail(edit({ changes: [{ field: 'spentType', from: 'Tooling', to: 'Rent' }] })),
    ).toEqual(['Category: Tooling → Rent']);
  });

  it('uses the shop’s word for an expense column, not the column name', () => {
    expect(fieldLabel('doneBy')).toBe('Spent by');
    expect(fieldLabel('toName')).toBe('Paid to');
    expect(fieldLabel('vendorGstin')).toBe('Vendor GSTIN');
  });
});
