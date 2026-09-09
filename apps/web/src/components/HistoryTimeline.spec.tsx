import { render, screen } from '@testing-library/react';
import type { HistoryEntry } from '@fas/shared';
import { HistoryTimeline } from './HistoryTimeline';

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: 'h1',
  at: '2026-09-08T10:00:00.000Z',
  kind: 'changed',
  action: 'order.updated',
  entity: 'Order',
  entityId: 'o1',
  ...over,
});

describe('the timeline', () => {
  it('says so when nothing has happened', () => {
    render(<HistoryTimeline entries={[]} />);
    expect(screen.getByText('Nothing has happened yet')).toBeInTheDocument();
  });

  it('shows a change with both sides of it', () => {
    render(
      <HistoryTimeline entries={[entry({ changes: [{ field: 'rate', from: 100, to: 150 }] })]} />,
    );
    expect(screen.getByText('Rate changed')).toBeInTheDocument();
    expect(screen.getByText(/Rate: 100 →/)).toBeInTheDocument();
  });

  it('marks a step back as its own kind of move', () => {
    render(
      <HistoryTimeline
        entries={[entry({ kind: 'moved', from: 'Cutting', to: 'Design', reversed: true })]}
      />,
    );
    const row = screen.getByText('Cutting → Design · went back').closest('li');
    // The dot carries the meaning a column used to; a step back is not the
    // same colour as a step forward.
    expect(row).toHaveAttribute('data-kind', 'reversed');
  });

  it('marks what was added and what was removed', () => {
    render(
      <HistoryTimeline
        entries={[
          entry({ id: 'a', kind: 'created', entity: 'Payment' }),
          entry({ id: 'b', kind: 'deleted', entity: 'OrderItem' }),
        ]}
      />,
    );
    expect(screen.getByText('Payment added').closest('li')).toHaveAttribute('data-kind', 'created');
    expect(screen.getByText('Line removed').closest('li')).toHaveAttribute('data-kind', 'deleted');
  });

  it('quotes the reason somebody gave', () => {
    render(<HistoryTimeline entries={[entry({ reason: 'Client changed the design' })]} />);
    expect(screen.getByText(/Client changed the design/)).toBeInTheDocument();
  });

  it('leaves out the columns nobody wants to read', () => {
    render(
      <HistoryTimeline
        entries={[entry({ changes: [{ field: 'updatedAt', from: 'a', to: 'b' }] })]}
      />,
    );
    expect(screen.queryByText(/Updated at/)).not.toBeInTheDocument();
  });

  it('says which part of the order a change was on', () => {
    render(<HistoryTimeline entries={[entry({ entity: 'OrderItem', kind: 'created' })]} />);
    expect(screen.getByText(/· line/)).toBeInTheDocument();
  });
});
