import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import type { Lead } from '@fas/shared';
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
 * The items on an enquiry that is already on the board.
 *
 * They can be typed when the enquiry is taken, but a client who rings back
 * with two more things, or a rate agreed on a second call, has to be
 * recordable — a list that can only ever be entered once is one the shop
 * works around by raising a second enquiry, which is how a pipeline stops
 * counting.
 *
 * The same editor the enquiry was created with, and the one Quotes uses, with
 * the tax turned off. Saving replaces the set: a revised list is a new list,
 * not an amendment to the old one.
 */
export function LeadItemsScreen({ route, navigation }: { route: any; navigation: any }) {
  const { leadId } = route.params as { leadId: string };

  const lead = useApi<Lead>(() => api.lead(leadId), [leadId]);

  const [lines, setLines] = useState<PricedLine[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const data = lead.data;
    if (!data) return;
    setLines(
      data.items?.length
        ? data.items.map((item) => ({
            key: item.id,
            name: item.name,
            description: item.description ?? undefined,
            quantity: Number(item.quantity) || undefined,
            unit: item.unit,
            ratePerUnit: Number(item.ratePerUnit) || undefined,
            discountPct: Number(item.discountPct) || undefined,
          }))
        : [blankLine()],
    );
  }, [lead.data]);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateLead(leadId, {
        /*
         * Always sent, empty included. On this screen an empty set is
         * somebody deliberately clearing the pricing, which is exactly the
         * case the API distinguishes from a form that stayed quiet.
         */
        items: usableLines(lines).map(({ key: _key, ...line }) => ({
          name: line.name.trim(),
          description: line.description?.trim() || undefined,
          unit: line.unit,
          quantity: line.quantity || undefined,
          ratePerUnit: line.ratePerUnit || undefined,
          discountPct: line.discountPct || undefined,
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
        title="Items"
        subtitle={lead.data.code}
        onBack={() => navigation.goBack()}
      />

      <Text variant="tiny" tone="faint" style={{ marginBottom: spacing.lg }}>
        What the client asked for. A rate is optional — put one in if you know
        it, and it carries into the quote rather than being typed again. GST
        is worked out on the quote, not here.
      </Text>

      <PricedLines
        lines={lines}
        onChange={setLines}
        /* Unused without tax, but the editor is shared with the quote. */
        treatment="EXCLUSIVE"
        onTreatmentChange={() => undefined}
        tax={false}
        allowEmpty
        placeholder="MDF jali, laser cut"
      />

      <Button
        title="Save items"
        size="lg"
        loading={busy}
        onPress={save}
        style={{ marginTop: spacing.lg }}
      />
    </Screen>
  );
}
