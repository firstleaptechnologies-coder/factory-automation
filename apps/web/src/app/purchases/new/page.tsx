'use client';

import { Shell } from '@/components/Shell';
import { PurchaseForm } from '../PurchaseForm';

/** Writing an order. Editing a draft happens on its own page, under ?edit=1. */
export default function NewPurchasePage() {
  return (
    <Shell>
      <PurchaseForm />
    </Shell>
  );
}
