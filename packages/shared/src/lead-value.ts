/**
 * What an enquiry is worth, and in what order to believe the figures.
 *
 * Three numbers can each claim to be it, and they are not interchangeable:
 *
 *   `quotedValue`   what a quotation actually went out at. Somebody was told
 *                   this number, so it beats everything.
 *   `grandTotal`    what the enquiry's own priced lines come to. Worked out
 *                   from rates, so it is a real figure — but nobody has been
 *                   sent it.
 *   `estimatedValue` what somebody thought the job was worth with the phone
 *                   still warm. A guess, and the weakest of the three.
 *
 * Derived rather than stored, deliberately. Writing the priced total into
 * `estimatedValue` would put the same number in two columns, and the second
 * copy goes stale the first time the lines are repriced — which is exactly
 * what happened: an enquiry repriced from GST-on-top to GST-included showed
 * the old figure on its card and the new one on its lines, in the same view.
 *
 * `quotedValue` is kept beside the guess rather than replacing it because the
 * difference between what somebody thought a job was worth and what it was
 * quoted at is the most useful thing a pipeline knows. Same reasoning applies
 * to the priced lines, so nothing here overwrites anything.
 */
export interface LeadValueFigures {
  quotedValue?: string | number | null;
  total?: string | number | null;
  estimatedValue?: string | number | null;
}

/** The figure to show, or null when the enquiry carries no number at all. */
export function leadValue(lead: LeadValueFigures): number | null {
  const quoted = num(lead.quotedValue);
  if (quoted !== null) return quoted;

  // Zero is what an unpriced enquiry's total is, not a price of nothing.
  const priced = num(lead.total);
  if (priced !== null && priced > 0) return priced;

  return num(lead.estimatedValue);
}

/** Which of the three the figure came from, for labelling it on screen. */
export function leadValueSource(
  lead: LeadValueFigures,
): 'quoted' | 'priced' | 'estimated' | null {
  if (num(lead.quotedValue) !== null) return 'quoted';
  const priced = num(lead.total);
  if (priced !== null && priced > 0) return 'priced';
  return num(lead.estimatedValue) !== null ? 'estimated' : null;
}

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
