'use client';

import {
  describeHistory,
  entityLabel,
  fieldLabel,
  historyValue,
  shownChanges,
  type HistoryEntry,
} from '@decor/shared';
import { formatDateTime } from '@/lib/format';

/**
 * One story, in order: moved, edited, paid, moved back.
 *
 * A table of status moves was right while a move was the only thing recorded.
 * Now that a corrected rate and a receipt taken sit in the same list, a
 * timeline reads better — and it is the same list the app shows, from the same
 * endpoint, described by the same shared vocabulary.
 */
export function HistoryTimeline({
  entries,
  empty = 'Nothing has happened yet',
}: {
  entries: HistoryEntry[];
  empty?: string;
}) {
  if (entries.length === 0) {
    return <p className="t-small faint">{empty}</p>;
  }

  return (
    <ol className="timeline" data-testid="history-timeline">
      {entries.map((entry) => (
        <li key={entry.id} className="timeline-row" data-kind={kindOf(entry)}>
          <span className="timeline-dot" aria-hidden />
          <div>
            <div className="t-small bold">{describeHistory(entry)}</div>

            {/* What a diff holds: the field, and both sides of it. */}
            {shownChanges(entry).map((change) => (
              <div key={change.field} className="t-tiny muted">
                {fieldLabel(change.field)}: {historyValue(change.from)} →{' '}
                <span className="bold">{historyValue(change.to)}</span>
              </div>
            ))}

            {entry.reason ? (
              <div className="t-tiny warning timeline-reason">“{entry.reason}”</div>
            ) : null}

            <div className="t-tiny faint">
              {formatDateTime(entry.at)}
              {entry.by ? ` · ${entry.by}` : ''}
              {isPartOfSomething(entry) ? ` · ${entityLabel(entry.entity).toLowerCase()}` : ''}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A step back should not look like an ordinary one. */
function kindOf(entry: HistoryEntry): string {
  return entry.kind === 'moved' && entry.reversed ? 'reversed' : entry.kind;
}

const PARTS = new Set([
  'OrderItem',
  'OrderAttachment',
  'Payment',
  'CashDeposit',
  'Disbursement',
  'EstimateItem',
  'ClientLocation',
]);

const isPartOfSomething = (entry: HistoryEntry) => PARTS.has(entry.entity);
