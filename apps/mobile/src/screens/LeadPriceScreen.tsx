import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import type { GstSlab, Lead, TaxTreatment } from '@fas/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import {
  PricedLines,
  blankLine,
  usableLines,
  type PricedLine,
} from '../components/PricedLines';
import { Button, Loader, Screen, ScreenHeader, Text, haptic } from '../ui';
import { spacing } from '../theme';

/**
 * Pricing an enquiry that is already on the board.
 *
 * The lines can be typed when the enquiry is taken, but a rate agreed on a
 * second call, or one typed wrongly the first time, has to be fixable — a
 * price that can only ever be entered once is a price the shop works around
 * by raising a second enquiry, which is how a pipeline stops counting.
 *
 * The same editor the enquiry was created with, and the same one Quotes uses.
 * Saving replaces the set: a revised price is a new set of numbers, not an
 * amendment to the old ones.
 */
export function LeadPriceScreen({ route, navigation }: { route: any; navigation: any }) {
  const { leadId } = route.params as { leadId: string };

  const lead = useApi<Lead>(() => api.lead(leadId), [leadId]);
  const slabs = useApi<GstSlab[]>(() => api.gstSlabs(), []);

  const [treatment, setTreatment] = useState<TaxTreatment>('EXCLUSIVE');
  const [lines, setLines] = useState<PricedLine[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const data = lead.data;
    if (!data) return;
    setTreatment(data.taxTreatment ?? 'EXCLUSIVE');
    setLines(
      data.items?.length
        ? data.items.map((item) => ({
            key: item.id,
            name: item.name,
            description: item.description ?? undefined,
            hsnSac: item.hsnSac ?? undefined,
            quantity: Number(item.quantity),
            unit: item.unit,
            ratePerUnit: Number(item.ratePerUnit),
            discountPct: Number(item.discountPct) || undefined,
            gstSlabId: item.gstSlabId ?? undefined,
          }))
        : [blankLine()],
    );
  }, [lead.data]);

  const defaultSlab = slabs.data?.find((slab) => slab.isDefault) ?? slabs.data?.[0];

  const save = async () => {
    setBusy(true);
    try {
      await api.updateLead(leadId, {
        taxTreatment: treatment,
        /*
         * Always sent, empty included. On this screen an empty set is
         * somebody deliberately clearing the pricing, which is exactly the
         * case the API distinguishes from a form that stayed quiet.
         */
        items: usableLines(lines).map(({ key: _key, ...line }) => ({
          ...line,
          name: line.name.trim(),
          gstSlabId: line.gstSlabId ?? defaultSlab?.id,
        })),
      });
      haptic('notificationSuccess');
      navigation.goBack();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!lead.data) return <Loader />;

  return (
    <Screen>
      <ScreenHeader
        title="Price this enquiry"
        subtitle={lead.data.code}
        onBack={() => navigation.goBack()}
      />

      <Text variant="tiny" tone="faint" style={{ marginBottom: spacing.lg }}>
        The same lines a quote takes. Priced here, they carry into the quote
        rather than being typed again.
      </Text>

      <PricedLines
        lines={lines}
        onChange={setLines}
        treatment={treatment}
        onTreatmentChange={setTreatment}
        slabs={slabs.data ?? undefined}
        allowEmpty
      />

      <Button
        title="Save pricing"
        size="lg"
        loading={busy}
        onPress={save}
        style={{ marginTop: spacing.lg }}
      />
    </Screen>
  );
}
