import {
  renderPricedDocumentHtml,
  type PricedDocumentInput,
} from '../../common/documents/priced-document';

/**
 * The printable estimate.
 *
 * The page itself lives in common/documents, because an enquiry priced on the
 * phone is the same document with a different word in the corner, and two
 * renderers would eventually disagree about where the discount column goes.
 * What is left here is what is true of a quotation and not of an enquiry: the
 * number it is filed under, the date it was issued, and how long it stands.
 */
export interface DocumentInput {
  estimate: Record<string, any>;
  firm: Record<string, any>;
  amountInWords: string;
  terms: string;
  interState: boolean;
  /** Absolute URL of the uploaded letterhead, when the firm has one. */
  letterheadUrl?: string | null;
  logoUrl?: string | null;
}

export function renderEstimateHtml(input: DocumentInput): string {
  const { estimate, ...rest } = input;
  const facts: PricedDocumentInput['facts'] = [
    { label: 'Estimate No.:', value: String(estimate.code ?? '') },
    { label: 'Date:', value: shortDate(estimate.issuedOn) },
  ];
  // Only where one was set: a quote with no expiry should not print an empty
  // row implying it has already lapsed.
  if (estimate.validTill) {
    facts.push({ label: 'Valid till:', value: shortDate(estimate.validTill) });
  }

  return renderPricedDocumentHtml({
    ...rest,
    document: estimate,
    docType: 'Estimate',
    facts,
  });
}

function shortDate(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}
