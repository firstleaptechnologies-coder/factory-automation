/**
 * One number, one spelling.
 *
 * Numbers reach us however they were typed — "+91 98290-12345" from a contact
 * card, "098290 12345" off a visiting card, "9829012345" from somebody in a
 * hurry. Three spellings of one number become three clients, and a client is
 * where a firm's money history lives: the outstanding splits, each statement
 * is wrong, and the shop chases half a balance.
 *
 * So both ends reduce a number the same way before it is stored or compared.
 * This lives in shared rather than in each client precisely because the two
 * copies drifting apart would not break anything loudly — it would just quietly
 * stop catching duplicates.
 */
export function normalisePhone(raw?: string | null): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return undefined;
  // Indian numbers are ten digits; a country code in front is the same person.
  if (digits.length > 10 && digits.startsWith('91')) return digits.slice(-10);
  // Anything else is left as it was typed rather than guessed at — a landline
  // or a short internal number is still what somebody meant to write down.
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** The client the server refused to duplicate, as it comes back on a 409. */
export interface DuplicateClient {
  id: string;
  name: string;
  code: string;
  phone: string | null;
}

/**
 * Read a "this number is already on file" refusal off an error.
 *
 * Both clients ask this rather than reaching into the error body themselves,
 * so a refusal that gets richer later does not have to be re-learned in two
 * places — and so neither of them treats a plain 409 from somewhere else as a
 * duplicate client.
 */
export function duplicateClientFrom(error: unknown): DuplicateClient | null {
  const body = (error as { status?: number; body?: unknown })?.body;
  if ((error as { status?: number })?.status !== 409) return null;
  const existing = (body as { existing?: unknown })?.existing as DuplicateClient | undefined;
  return existing && typeof existing.id === 'string' && typeof existing.name === 'string'
    ? existing
    : null;
}
