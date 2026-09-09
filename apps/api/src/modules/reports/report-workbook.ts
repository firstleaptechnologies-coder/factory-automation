import ExcelJS from 'exceljs';

/**
 * Rows into a workbook somebody's accountant will actually open.
 *
 * The sheets are described rather than drawn: a report says what its columns
 * are and which of them are money, and this decides what that looks like. The
 * alternative — each report formatting its own cells — is how two reports come
 * to disagree about what a rupee looks like.
 *
 * Numbers are written as numbers. A figure formatted into a string by us is a
 * figure the CA cannot sum, and the first thing they do is sum it.
 */

export type CellType = 'text' | 'money' | 'number' | 'date' | 'days';

export interface Column {
  key: string;
  header: string;
  type?: CellType;
  width?: number;
}

export interface Sheet {
  name: string;
  columns: Column[];
  /**
   * Declared as objects rather than an index-signed record: a report's rows
   * are named interfaces, and an interface has no index signature, so
   * `Record<string, unknown>` would reject every one of them.
   */
  rows: readonly object[];
  /** Columns to total in a bold row at the foot. */
  total?: readonly string[];
  /** Shown above the table when the sheet needs a word of explanation. */
  note?: string;
}

export interface WorkbookSpec {
  title: string;
  period?: { from?: string | null; to?: string | null };
  /** The shop, so a workbook found on a desk says whose it is. */
  firmName?: string;
  sheets: Sheet[];
}

// Indian grouping — 1,18,000.00 rather than 118,000.00. It is what every
// figure in the rest of the product is shown as, and a workbook that grouped
// differently would look like it came from somewhere else.
const MONEY_FORMAT = '#,##,##0.00';

/** Excel refuses these in a sheet name, and silently truncates past 31. */
function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
}

export async function writeWorkbook(spec: WorkbookSpec): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = spec.firmName ?? 'Decor Bucket';
  workbook.created = new Date();

  for (const sheet of spec.sheets) {
    const worksheet = workbook.addWorksheet(safeSheetName(sheet.name));

    // A heading block, so a printed page says what it is without the file name.
    const heading = worksheet.addRow([spec.title]);
    heading.font = { bold: true, size: 14 };

    const subtitleParts = [
      spec.firmName,
      spec.period?.from && spec.period?.to
        ? `${spec.period.from} to ${spec.period.to}`
        : undefined,
    ].filter(Boolean);
    if (subtitleParts.length) worksheet.addRow([subtitleParts.join('  ·  ')]);
    if (sheet.note) worksheet.addRow([sheet.note]);
    worksheet.addRow([]);

    const headerRow = worksheet.addRow(sheet.columns.map((column) => column.header));
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF0F0' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFB0BBBB' } } };
    });

    for (const row of sheet.rows) {
      const cells = row as Record<string, unknown>;
      const added = worksheet.addRow(sheet.columns.map((column) => cellValue(cells[column.key], column)));
      sheet.columns.forEach((column, index) => {
        if (column.type === 'money') added.getCell(index + 1).numFmt = MONEY_FORMAT;
      });
    }

    if (sheet.total?.length && sheet.rows.length) {
      const totals = sheet.columns.map((column) => {
        if (!sheet.total?.includes(column.key)) return null;
        const total = sheet.rows.reduce(
          (sum, row) => sum + (Number((row as Record<string, unknown>)[column.key]) || 0),
          0,
        );
        // Rounded, because adding rounded figures does not give a rounded sum:
        // six order balances summed to 595825.2000000001, and a workbook that
        // shows an accountant a rupee with ten decimal places is a workbook
        // they stop trusting.
        return Math.round((total + Number.EPSILON) * 100) / 100;
      });
      // The label goes in the first column that is not itself being totalled,
      // so it never overwrites a figure.
      const labelAt = totals.findIndex((value) => value === null);
      if (labelAt >= 0) totals[labelAt] = 'Total' as never;

      const totalRow = worksheet.addRow(totals);
      totalRow.font = { bold: true };
      totalRow.eachCell((cell) => {
        cell.border = { top: { style: 'thin', color: { argb: 'FF6B7A7A' } } };
      });
      sheet.columns.forEach((column, index) => {
        if (column.type === 'money' && sheet.total?.includes(column.key)) {
          totalRow.getCell(index + 1).numFmt = MONEY_FORMAT;
        }
      });
    }

    sheet.columns.forEach((column, index) => {
      worksheet.getColumn(index + 1).width = column.width ?? defaultWidth(column);
    });

    // Freeze the header so a thousand-row register still says which column is
    // which when somebody scrolls to the bottom.
    worksheet.views = [{ state: 'frozen', ySplit: headerRow.number }];
  }

  if (!spec.sheets.length) workbook.addWorksheet('Empty');

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function cellValue(value: unknown, column: Column): string | number | Date | null {
  if (value === null || value === undefined || value === '') return column.type === 'text' ? '' : null;

  if (column.type === 'money' || column.type === 'number' || column.type === 'days') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  // Dates stay strings: they are already ISO days, which sort correctly and
  // do not acquire a timezone on the way into a cell.
  return String(value);
}

function defaultWidth(column: Column): number {
  if (column.type === 'money') return 16;
  if (column.type === 'date') return 12;
  if (column.type === 'days' || column.type === 'number') return 10;
  return Math.min(Math.max(column.header.length + 4, 14), 40);
}
