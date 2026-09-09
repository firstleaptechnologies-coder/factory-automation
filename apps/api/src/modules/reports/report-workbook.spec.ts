import ExcelJS from 'exceljs';
import { writeWorkbook, WorkbookSpec } from './report-workbook';

/** Read back what was written, because the point is the file, not the call. */
async function reopen(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  return workbook;
}

/**
 * Find the table rather than assume where it starts.
 *
 * The heading block is two or three rows depending on whether the sheet
 * carries a note, so counting from the top makes a test that breaks when the
 * heading changes rather than when the table does.
 */
function table(sheet: ExcelJS.Worksheet, headerText: string) {
  let headerAt = 0;
  sheet.eachRow((row, number) => {
    if (!headerAt && row.getCell(1).value === headerText) headerAt = number;
  });
  return {
    header: sheet.getRow(headerAt),
    firstRow: sheet.getRow(headerAt + 1),
    lastRow: sheet.getRow(sheet.rowCount),
  };
}

const spec = (over: Partial<WorkbookSpec> = {}): WorkbookSpec => ({
  title: 'Cash book',
  firmName: 'Decor Bucket',
  period: { from: '2026-04-01', to: '2026-06-30' },
  sheets: [
    {
      name: 'Cash book',
      columns: [
        { key: 'date', header: 'Date', type: 'date' },
        { key: 'party', header: 'Party' },
        { key: 'moneyIn', header: 'Money in', type: 'money' },
        { key: 'moneyOut', header: 'Money out', type: 'money' },
      ],
      rows: [
        { date: '2026-04-01', party: 'Sharma Interiors', moneyIn: 50_000, moneyOut: 0 },
        { date: '2026-04-02', party: 'Ravi', moneyIn: 0, moneyOut: 8000 },
      ],
      total: ['moneyIn', 'moneyOut'],
    },
  ],
  ...over,
});

describe('writing a workbook', () => {
  it('produces a file Excel can open', async () => {
    const workbook = await reopen(await writeWorkbook(spec()));

    expect(workbook.worksheets).toHaveLength(1);
    expect(workbook.getWorksheet('Cash book')).toBeDefined();
  });

  // The first thing an accountant does is sum a column. A figure written as
  // text is a figure they cannot sum.
  it('writes money as numbers, not as formatted text', async () => {
    const workbook = await reopen(await writeWorkbook(spec()));
    const { firstRow } = table(workbook.getWorksheet('Cash book')!, 'Date');

    expect(typeof firstRow.getCell(3).value).toBe('number');
    expect(firstRow.getCell(3).value).toBe(50_000);
  });

  it('formats money the Indian way', async () => {
    const workbook = await reopen(await writeWorkbook(spec()));
    const { firstRow } = table(workbook.getWorksheet('Cash book')!, 'Date');

    expect(firstRow.getCell(3).numFmt).toBe('#,##,##0.00');
  });

  it('totals the columns it was asked to', async () => {
    const workbook = await reopen(await writeWorkbook(spec()));
    const { lastRow } = table(workbook.getWorksheet('Cash book')!, 'Date');

    expect(lastRow.getCell(3).value).toBe(50_000);
    expect(lastRow.getCell(4).value).toBe(8000);
  });

  // Writing "Total" over a figure would silently lose it.
  it('puts the total label in a column that is not itself totalled', async () => {
    const workbook = await reopen(await writeWorkbook(spec()));
    const { lastRow } = table(workbook.getWorksheet('Cash book')!, 'Date');

    expect(lastRow.getCell(1).value).toBe('Total');
    // and it did not land on a figure
    expect(lastRow.getCell(3).value).toBe(50_000);
  });

  // Adding rounded figures does not give a rounded sum.
  it('rounds the total rather than showing accumulated float error', async () => {
    const drifty = spec();
    drifty.sheets[0].rows = [
      { date: '2026-04-01', party: 'A', moneyIn: 595_825.1, moneyOut: 0 },
      { date: '2026-04-02', party: 'B', moneyIn: 0.1, moneyOut: 0 },
    ];
    const workbook = await reopen(await writeWorkbook(drifty));
    const { lastRow } = table(workbook.getWorksheet('Cash book')!, 'Date');

    expect(lastRow.getCell(3).value).toBe(595_825.2);
  });

  it('says what the report is and what period it covers', async () => {
    const workbook = await reopen(await writeWorkbook(spec()));
    const sheet = workbook.getWorksheet('Cash book')!;

    expect(sheet.getRow(1).getCell(1).value).toBe('Cash book');
    expect(String(sheet.getRow(2).getCell(1).value)).toContain('2026-04-01 to 2026-06-30');
  });

  it('freezes the header so a long register stays readable', async () => {
    const workbook = await reopen(await writeWorkbook(spec()));
    const sheet = workbook.getWorksheet('Cash book')!;

    expect(sheet.views[0]).toMatchObject({ state: 'frozen' });
  });

  it('adds no total row when there is nothing to total', async () => {
    const empty = spec();
    empty.sheets[0].rows = [];
    const workbook = await reopen(await writeWorkbook(empty));
    const sheet = workbook.getWorksheet('Cash book')!;
    const { header } = table(sheet, 'Date');

    // The header is the last row carrying anything: no data, so no total.
    let lastWritten = 0;
    sheet.eachRow((_row, number) => {
      lastWritten = number;
    });
    expect(lastWritten).toBe(header.number);
  });

  // Excel refuses these characters outright and truncates past 31.
  it('makes a sheet name Excel will accept', async () => {
    const named = spec();
    named.sheets[0].name = 'Receivables: 2026/27 [draft] for a very long quarter';
    const workbook = await reopen(await writeWorkbook(named));

    const name = workbook.worksheets[0].name;
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[\\/?*[\]:]/);
  });

  it('opens even with no sheets at all', async () => {
    const workbook = await reopen(await writeWorkbook(spec({ sheets: [] })));

    expect(workbook.worksheets.length).toBeGreaterThan(0);
  });
});
