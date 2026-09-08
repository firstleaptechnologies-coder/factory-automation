'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { EstimateForm, QuotingFor } from '@/components/EstimateForm';

export default function NewEstimatePage() {
  return (
    <Shell>
      {/* useSearchParams suspends on the server render. */}
      <Suspense fallback={null}>
        <NewEstimate />
      </Suspense>
    </Shell>
  );
}

/**
 * A blank quotation, or one already knowing the enquiry it is for.
 *
 * The enquiry arrives in the query string rather than in a store: the lead
 * board pushes here, and a quote half-written this way survives a reload with
 * the enquiry still attached to it.
 */
function NewEstimate() {
  const params = useSearchParams();
  const leadId = params.get('leadId');

  const lead: QuotingFor | undefined = leadId
    ? {
        id: leadId,
        code: params.get('leadCode') ?? '',
        title: params.get('title') ?? undefined,
        clientId: params.get('clientId') ?? undefined,
        clientName: params.get('clientName') ?? undefined,
        location: params.get('location') ?? undefined,
      }
    : undefined;

  return <EstimateForm lead={lead} />;
}
