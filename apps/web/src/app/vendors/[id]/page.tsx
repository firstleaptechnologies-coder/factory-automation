'use client';

import { use } from 'react';
import { Shell } from '@/components/Shell';
import { VendorForm } from '../VendorForm';

export default function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Shell>
      <VendorForm id={id} />
    </Shell>
  );
}
