import React from 'react';
import { render, screen } from '@testing-library/react-native';
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
  it('says so when nothing has happened', async () => {
    await render(<HistoryTimeline entries={[]} />);
    expect(screen.getByText('Nothing has happened yet')).toBeTruthy();
  });

  it('shows a change with both sides of it', async () => {
    await render(
      <HistoryTimeline entries={[entry({ changes: [{ field: 'rate', from: 100, to: 150 }] })]} />,
    );
    expect(screen.getByText('Rate changed')).toBeTruthy();
    expect(screen.getByText(/Rate: 100 →/)).toBeTruthy();
  });

  it('leaves out the columns nobody wants to read', async () => {
    await render(
      <HistoryTimeline
        entries={[
          entry({
            changes: [
              { field: 'updatedAt', from: 'a', to: 'b' },
              { field: 'rate', from: 1, to: 2 },
            ],
          }),
        ]}
      />,
    );
    expect(screen.queryByText(/Updated at/)).toBeNull();
  });

  it('quotes the reason somebody gave', async () => {
    await render(<HistoryTimeline entries={[entry({ reason: 'Client changed the design' })]} />);
    expect(screen.getByText(/Client changed the design/)).toBeTruthy();
  });

  it('names who did it and when', async () => {
    await render(<HistoryTimeline entries={[entry({ by: 'Rajat' })]} />);
    expect(screen.getByText(/Rajat/)).toBeTruthy();
  });

  it('says which part of the order it was, when it was not the order itself', async () => {
    await render(
      <HistoryTimeline entries={[entry({ entity: 'Payment', kind: 'created' })]} />,
    );
    expect(screen.getByText('Payment added')).toBeTruthy();
    expect(screen.getByText(/· payment/)).toBeTruthy();
  });

  it('does not label the thing itself as a part of itself', async () => {
    await render(<HistoryTimeline entries={[entry({ entity: 'Order', by: 'Rajat' })]} />);
    expect(screen.queryByText(/· order$/)).toBeNull();
  });
});
