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
     * enquiry names differently — it has whoever rang, and it may have only
     * the site rather than a billing address. Mapped here rather than bent
     * into the Lead model.
     */
    document: {
      ...lead,
      clientName: lead.client?.name ?? lead.contactName ?? lead.company,
      // The enquiry's own billing address where one was taken, and where the
      // work would be otherwise — an enquiry often has the site before it has
      // anywhere to send a bill.
      billingAddress: lead.billingAddress ?? lead.location,
      shippingAddress: lead.shippingAddress,
    },
    docType: 'Enquiry',
    /*
     * No HSN column, no GST column, no tax rows. An enquiry is not a tax
     * document, and a priced sheet carrying a GST column reads as a bill to
     * whoever is holding it — which is the same reason the corner says
     * Enquiry rather than Estimate.
     */
    showTax: false,
    facts,
  });
}

function shortDate(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}
