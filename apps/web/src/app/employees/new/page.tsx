'use client';

import { Shell } from '@/components/Shell';
import { EmployeeForm } from '../EmployeeForm';

/** Add somebody. Correcting them happens on their own page, under ?edit=1. */
export default function NewEmployeePage() {
  return (
    <Shell>
      <EmployeeForm />
    </Shell>
  );
}
