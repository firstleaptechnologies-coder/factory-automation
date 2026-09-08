import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { DataTable } from './DataTable';

interface Row {
  id: string;
  size: string;
  qty: number;
}

const ROWS: Row[] = [
  { id: 'i1', size: '8 × 4 ft', qty: 2 },
  { id: 'i2', size: '6 × 3 ft', qty: 1 },
];

const COLUMNS = [
  { key: 'size', header: 'Size', flex: 2, render: (row: Row) => <Text>{row.size}</Text> },
  {
    key: 'qty',
    header: 'Qty',
    align: 'right' as const,
    render: (row: Row) => <Text>{String(row.qty)}</Text>,
  },
];

const mount = (props: Record<string, unknown> = {}) =>
  render(<DataTable columns={COLUMNS} rows={ROWS} {...props} />);

it('writes a header per column', async () => {
  await mount();
  // Laid out as free text these read as a paragraph; the eye cannot scan one
  // field down the column.
  expect(screen.getByText('Size')).toBeTruthy();
  expect(screen.getByText('Qty')).toBeTruthy();
});

it('renders every row through the caller’s renderer', async () => {
  await mount();
  expect(screen.getByText('8 × 4 ft')).toBeTruthy();
  expect(screen.getByText('6 × 3 ft')).toBeTruthy();
});

it('says when there is nothing, rather than showing bare headers', async () => {
  await mount({ rows: [] });
  expect(screen.getByText('Nothing here')).toBeTruthy();
});

it('takes its own empty wording', async () => {
  await mount({ rows: [], empty: 'No items on this order' });
  expect(screen.getByText('No items on this order')).toBeTruthy();
});

it('gives the table a definite width, not a minimum', async () => {
  const view = await mount({ minWidth: 520 });
  const json = JSON.stringify(view.toJSON());
  // Inside a horizontal ScrollView a child gets unbounded width, so a minimum
  // left the row free to grow and the flex shares meant nothing.
  expect(json).toContain('"width":520');
  expect(json).not.toContain('"minWidth":520');
});

it('scrolls sideways only when the columns need more room than a phone has', async () => {
  const narrow = await mount();
  expect(JSON.stringify(narrow.toJSON())).not.toContain('RCTScrollView');

  const wide = await render(<DataTable columns={COLUMNS} rows={ROWS} minWidth={520} />);
  expect(JSON.stringify(wide.toJSON())).toContain('RCTScrollView');
});

it('honours a column’s share of the width', async () => {
  const view = await mount();
  const json = JSON.stringify(view.toJSON());
  expect(json).toContain('"flex":2');
  expect(json).toContain('"flex":1');
});

it('pushes a right-aligned column’s content to the end', async () => {
  const view = await mount();
  expect(JSON.stringify(view.toJSON())).toContain('"alignItems":"flex-end"');
});

it('divides the rows but not above the first', async () => {
  const view = await mount();
  const dividers = JSON.stringify(view.toJSON()).match(/borderTopWidth/g) ?? [];
  expect(dividers).toHaveLength(ROWS.length - 1);
});

it('copes with rows that carry no id', async () => {
  await render(
    <DataTable
      columns={[
        {
          key: 'a',
          header: 'A',
          render: (row) => <Text>{(row as { a: string }).a}</Text>,
        },
      ]}
      rows={[{ a: 'one' }, { a: 'two' }] as never}
    />,
  );
  expect(screen.getByText('one')).toBeTruthy();
  expect(screen.getByText('two')).toBeTruthy();
});

it('draws a row’s detail under it, across the whole width', async () => {
  await mount({ detail: (row: Row) => <Text>{`moves out of ${row.id}`}</Text> });
  // A column of wrapping chips either sets the width of the whole table or
  // squeezes every other column to nothing; under the row it costs no width.
  expect(screen.getByText('moves out of i1')).toBeTruthy();
  expect(screen.getByText('moves out of i2')).toBeTruthy();
});

it('leaves the rows alone when there is no detail to draw', async () => {
  const view = await mount();
  const rows = JSON.stringify(view.toJSON());
  expect(rows).toContain('8 × 4 ft');
  // Nothing empty is added under a row that has no detail.
  expect(screen.queryByText('moves out of i1')).toBeNull();
});
