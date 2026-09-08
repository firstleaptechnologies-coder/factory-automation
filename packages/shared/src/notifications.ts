import { PERMISSIONS, type Permission } from './permissions';

/**
 * What the product tells people about, and what it says.
 *
 * The triggers are ours — a shop cannot invent a new one — but the wording is
 * theirs, because "moved to Cutting" and "गया कटिंग में" are the same event and
 * only one of them is right for a given floor. A tenant's row overrides the
 * default for a key, or switches it off entirely: a notification nobody wants
 * is worse than none.
 *
 * Placeholders are `{name}` and are filled from values the trigger supplies.
 * A placeholder with nothing behind it is dropped rather than shown raw.
 */
export interface NotificationTemplate {
  key: string;
  /** What this is, in the settings screen. */
  label: string;
  /** When it fires, in the shop's own terms. */
  blurb: string;
  title: string;
  body: string;
  /**
   * Who is eligible to receive it.
   *
   * Not who may read the screen — who this is *for*. Somebody who cannot see
   * payments should not be told one was taken.
   */
  permission: Permission;
  /** The placeholders this trigger fills, for the settings screen to show. */
  values: string[];
}

export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  {
    key: 'order.moved',
    label: 'An order moves on',
    blurb: 'Whenever an order reaches a new stage',
    title: '{order} → {stage}',
    body: '{who} moved {order} to {stage} for {client}.',
    permission: PERMISSIONS.ORDER_VIEW,
    values: ['order', 'stage', 'client', 'who'],
  },
  {
    key: 'order.moved_back',
    label: 'An order goes back',
    blurb: 'When work is sent back a stage — rare, and worth knowing about',
    title: '{order} went back to {stage}',
    body: '{who} sent {order} back to {stage}. {reason}',
    permission: PERMISSIONS.ORDER_VIEW,
    values: ['order', 'stage', 'who', 'reason'],
  },
  {
    key: 'payment.recorded',
    label: 'Money comes in',
    blurb: 'When a receipt is entered against an order',
    title: '{amount} received',
    body: '{who} recorded {amount} against {order} from {client}.',
    permission: PERMISSIONS.PAYMENT_VIEW,
    values: ['amount', 'order', 'client', 'who'],
  },
  {
    key: 'payment.reversed',
    label: 'A receipt is taken back',
    blurb: 'When money entered wrongly is corrected',
    title: '{amount} taken back',
    body: '{who} took back {amount} on {order}. {reason}',
    permission: PERMISSIONS.PAYMENT_VIEW,
    values: ['amount', 'order', 'who', 'reason'],
  },
  {
    key: 'quote.accepted',
    label: 'A quote is accepted',
    blurb: 'When a client says yes',
    title: '{quote} accepted',
    body: '{client} accepted {quote} — {amount}.',
    permission: PERMISSIONS.ESTIMATE_VIEW,
    values: ['quote', 'client', 'amount'],
  },
  {
    key: 'quote.declined',
    label: 'A quote is declined',
    blurb: 'When a client says no, so somebody can ask why',
    title: '{quote} declined',
    body: '{client} declined {quote}.',
    permission: PERMISSIONS.ESTIMATE_VIEW,
    values: ['quote', 'client'],
  },
  {
    key: 'lead.moved',
    label: 'An enquiry moves on',
    blurb: 'Whenever an enquiry reaches a new stage',
    title: '{lead} → {stage}',
    body: '{who} moved {lead} to {stage}.',
    permission: PERMISSIONS.LEAD_VIEW,
    values: ['lead', 'stage', 'who'],
  },
];

export const NOTIFICATION_KEYS = NOTIFICATION_TEMPLATES.map((template) => template.key);

export function templateFor(key: string): NotificationTemplate | undefined {
  return NOTIFICATION_TEMPLATES.find((template) => template.key === key);
}

/**
 * Fill a template's placeholders.
 *
 * An unfilled placeholder is dropped along with the space in front of it, so a
 * move with no reason reads as a sentence rather than as a form with a hole in
 * it.
 */
export function renderNotification(
  text: string,
  values: Record<string, string | null | undefined>,
): string {
  return text
    .replace(/\s*\{(\w+)\}/g, (whole, name: string) => {
      const value = values[name];
      if (value === null || value === undefined || value === '') return '';
      return whole.startsWith(' ') ? ` ${value}` : String(value);
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** What a notification looks like once it has been raised. */
export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  entity?: string | null;
  entityId?: string | null;
  readAt?: string | null;
  createdAt: string;
}

/** A tenant's override for one key, as the settings screen edits it. */
export interface NotificationSetting {
  key: string;
  title: string;
  body: string;
  enabled: boolean;
  /** True when the shop has changed it from what the product ships with. */
  overridden: boolean;
}
