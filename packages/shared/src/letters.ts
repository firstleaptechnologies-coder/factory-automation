/**
 * The letters a shop gives its people.
 *
 * A fixed set of kinds because these are the ones an Indian shop is actually
 * asked for, and each has a shape the recipient's bank or landlord expects.
 * What each one *says* is the shop's, through a template it edits — which is
 * why the placeholders live here rather than in a screen: both clients preview
 * the same substitution the server performs.
 */

export const LETTER_KINDS = [
  'OFFER',
  'APPOINTMENT',
  'NDA',
  'RESPONSIBILITY',
  'EXPERIENCE',
  'RELIEVING',
  'WARNING',
] as const;

export type LetterKind = (typeof LETTER_KINDS)[number];

export const LETTER_LABELS: Record<LetterKind, string> = {
  OFFER: 'Offer letter',
  APPOINTMENT: 'Appointment letter',
  NDA: 'Non-disclosure',
  RESPONSIBILITY: 'Responsibilities',
  EXPERIENCE: 'Experience letter',
  RELIEVING: 'Relieving letter',
  WARNING: 'Warning letter',
};

export const LETTER_HINTS: Record<LetterKind, string> = {
  OFFER: 'Before they start — what is being offered',
  APPOINTMENT: 'On joining — the terms they are on',
  NDA: 'What they may not repeat outside',
  RESPONSIBILITY: 'What the job actually is, signed',
  EXPERIENCE: 'For somebody who has left — what they did here',
  RELIEVING: 'For somebody who has left — that they are free to go',
  WARNING: 'On the record, when something has gone wrong',
};

/** What a template may say instead of a name. */
export const LETTER_FIELDS = [
  'name',
  'code',
  'designation',
  'department',
  'joinedOn',
  'leftOn',
  'salary',
  'firmName',
  'firmAddress',
  'today',
] as const;

export type LetterField = (typeof LETTER_FIELDS)[number];

export const LETTER_FIELD_LABELS: Record<LetterField, string> = {
  name: 'Their name',
  code: 'Employee number',
  designation: 'What they do',
  department: 'Department',
  joinedOn: 'Date they joined',
  leftOn: 'Date they left',
  salary: 'What they are paid',
  firmName: 'The shop’s name',
  firmAddress: 'The shop’s address',
  today: 'Today’s date',
};

/**
 * Fills a template in.
 *
 * A placeholder nobody has a value for is left as it is rather than blanked:
 * `{{salary}}` staring back from a draft is a question somebody can answer,
 * where an empty space in the middle of a sentence is a letter that goes out
 * saying nothing about the pay.
 */
export function fillLetter(body: string, values: Partial<Record<LetterField, string>>): string {
  return body.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (whole, field: string) => {
    const value = values[field as LetterField];
    return value == null || value === '' ? whole : value;
  });
}

/** Which placeholders a template uses, in the order it first uses them. */
export function placeholdersIn(body: string): string[] {
  const found: string[] = [];
  for (const match of body.matchAll(/\{\{\s*([a-zA-Z]+)\s*\}\}/g)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

/** Placeholders a template uses that nothing will ever fill in. */
export function unknownPlaceholders(body: string): string[] {
  return placeholdersIn(body).filter(
    (field) => !LETTER_FIELDS.includes(field as LetterField),
  );
}
