'use client';

import { Shell } from '@/components/Shell';
import { ExpenseForm } from '../ExpenseForm';

/** Record an expense. Correcting one happens on its own page, under ?edit=1. */
export default function NewExpensePage() {
  return (
    <Shell>
      <ExpenseForm />
    </Shell>
  );
}
