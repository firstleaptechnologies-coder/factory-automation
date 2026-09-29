import {
  renderPricedDocumentHtml,
  type PricedDocumentInput,
} from '../../common/documents/priced-document';

/**
 * The printable enquiry.
 *
 * What a shop hands back across the counter, or sends on WhatsApp, when
 * somebody asks what a job would come to. It is not a quotation and does not
 * pretend to be one: it carries no quote number, no validity, and nothing on
 * it has been committed to. The word in the corner says Enquiry, so a client
 * who later receives the actual quote can tell the two apart — a priced page
 * that looks like a quotation *is* a quotation to the person holding it.
 *
 * The page itself is the same one Quotes prints, deliberately. Same lines,
 * same sum, same columns.
 */
export interface LeadDocumentInput {
  lead: Record<string, any>;
  firm: Record<string, any>;
  amountInWords: string;
  terms: string;
  interState: boolean;
  letterheadUrl?: string | null;
  logoUrl?: string | null;
}

export function renderLeadHtml(input: LeadDocumentInput): string {
  const { lead, ...rest } = input;

  const facts: PricedDocumentInput['facts'] = [
    { label: 'Enquiry No.:', value: String(lead.code ?? '') },
    { label: 'Date:', value: shortDate(lead.createdAt) },
  ];
  if (lead.expectedDate) {
    facts.push({ label: 'Expected by:', value: shortDate(lead.expectedDate) });
  }

  return renderPricedDocumentHtml({
    ...rest,
    /*
     * The shared page reads `clientName` and `billingAddress`, which an
     * enquiry does not have columns for — it has whoever rang and where the
     * work would be. Mapped here rather than adding empty columns to Lead:
     * an enquiry has no billing address because nothing is being billed.
     */
    document: {
      ...lead,
      clientName: lead.client?.name ?? lead.contactName ?? lead.company,
      billingAddress: lead.location,
    },
    docType: 'Enquiry',
    facts,
  });
}

function shortDate(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}
