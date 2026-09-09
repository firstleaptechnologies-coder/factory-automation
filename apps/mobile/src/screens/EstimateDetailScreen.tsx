import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Estimate, EstimateStatus, HistoryEntry } from '@fas/shared';
import { PERMISSIONS } from '@fas/shared';
import { api } from '../api/client';
import { HistoryTimeline } from '../components/HistoryTimeline';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../auth/AuthContext';
import { shareDocument } from '../lib/documents';
import { ContactPickerSheet } from '../components/ContactPickerSheet';
import {
  Button,
  Card,
  Field,
  Icon,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Sheet,
  SheetOption,
  Text,
  haptic,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatDateShort, formatInr } from '../lib/format';

const STATUSES: EstimateStatus[] = ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED'];

/** One quotation, with the ways of getting it to the client. */
export function EstimateDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const { estimateId } = route.params as { estimateId: string };
  const { can } = useAuth();

  /* What has been changed on this, and by whom. */
  const history = useApi<HistoryEntry[]>(
    () => api.history('quotes', estimateId),
    [estimateId],
  );

  const estimate = useApi<Estimate>(() => api.estimate(estimateId), [estimateId]);
  const [sharing, setSharing] = useState(false);
  const [statusSheet, setStatusSheet] = useState(false);
  const [contactSheet, setContactSheet] = useState(false);
  const [convertSheet, setConvertSheet] = useState(false);
  const [location, setLocation] = useState('');
  const [converting, setConverting] = useState(false);

  const canManage = can(PERMISSIONS.ESTIMATE_MANAGE);

  const share = async (phone?: string) => {
    if (!estimate.data) return;
    setSharing(true);
    try {
      const sent = await shareDocument({
        path: `/estimates/${estimateId}/document`,
        fileName: estimate.data.code,
        message: `Estimate ${estimate.data.code} — ${formatInr(estimate.data.grandTotal)}`,
        phone,
      });
      // Sending it is what makes it sent. Asking the user to also flip a status
      // afterwards is a step everyone forgets.
      if (sent && canManage && estimate.data.status === 'DRAFT') {
        await api.setEstimateStatus(estimateId, 'SENT');
        estimate.reload();
      }
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not share', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSharing(false);
    }
  };

  if (!estimate.data) return <Loader label="Loading estimate" />;
  const data = estimate.data;
  const interState = Number(data.igst) > 0;

  return (
    <Screen refreshing={estimate.refreshing} onRefresh={estimate.refresh}>
      <ScreenHeader
        title={data.code}
        subtitle={data.client?.name ?? data.clientName ?? undefined}
        onBack={() => navigation.goBack()}
      />

      <Animated.View entering={FadeInDown.duration(400)}>
        <Card tone="accent">
          <Text variant="label" tone="onAccent" style={{ opacity: 0.75 }}>
            Client pays
          </Text>
          <Text variant="display" tone="onAccent">{formatInr(data.grandTotal)}</Text>
          <View style={styles.heroFoot}>
            <View>
              <Text variant="tiny" tone="onAccent" style={{ opacity: 0.75 }}>Taxable</Text>
              <Text variant="h3" tone="onAccent">{formatInr(data.total)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="tiny" tone="onAccent" style={{ opacity: 0.75 }}>GST</Text>
              <Text variant="h3" tone="onAccent">{formatInr(data.taxAmount)}</Text>
            </View>
          </View>
        </Card>
      </Animated.View>

      <View style={styles.statusRow}>
        <Pill label={data.status} color={palette.accent} />
        <Text variant="tiny" tone="muted">{formatDateShort(data.issuedOn)}</Text>
      </View>

      <Button
        title="Send on WhatsApp"
        size="lg"
        loading={sharing}
        icon={<Icon name="arrowUpRight" size={18} color={palette.white} />}
        onPress={() => setContactSheet(true)}
        style={{ marginTop: spacing.lg }}
      />
      <Button
        title="Share another way"
        variant="dark"
        onPress={() => share()}
        style={{ marginTop: spacing.sm }}
      />

      <Text variant="label" tone="muted" style={styles.block}>Lines</Text>
      {data.items.map((item) => (
        <Card key={item.id} tone="dark" style={styles.line}>
          <View style={styles.lineTop}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="body" bold numberOfLines={2}>{item.name}</Text>
              <Text variant="tiny" tone="muted">
                {Number(item.quantity)} {item.unit} × {formatInr(item.ratePerUnit)}
                {item.hsnSac ? ` · HSN ${item.hsnSac}` : ''}
              </Text>
            </View>
            <Text variant="h3">{formatInr(item.amount)}</Text>
          </View>
          <Text variant="tiny" tone="faint" style={{ marginTop: 4 }}>
            {Number(item.discountAmount) > 0
              ? `less ${formatInr(item.discountAmount)} (${Number(item.discountPct)}%) · `
              : ''}
            GST {formatInr(item.taxAmount)} ({Number(item.gstRatePct)}%)
          </Text>
        </Card>
      ))}

      <Card tone="dark" style={{ marginTop: spacing.md }}>
        <Row label="Sub total" value={formatInr(data.subtotal)} />
        {Number(data.discount) > 0 ? (
          <Row label="Discount" value={formatInr(data.discount)} />
        ) : null}
        {interState ? (
          <Row label="IGST" value={formatInr(data.igst)} />
        ) : (
          <>
            <Row label="SGST" value={formatInr(data.sgst)} />
            <Row label="CGST" value={formatInr(data.cgst)} />
          </>
        )}
        <Row label="Total" value={formatInr(data.grandTotal)} accent />
        {Number(data.savedAmount) > 0 ? (
          <Row label="You saved" value={formatInr(data.savedAmount)} />
        ) : null}
      </Card>

      {/* Where this came from. A quote written for an enquiry belongs to it,
          and the pipeline's figure for that enquiry is this one. */}
      {data.lead ? (
        <Card
          tone="dark"
          style={{ marginTop: spacing.lg }}
          onPress={() => navigation.navigate('LeadDetail', { leadId: data.lead!.id })}>
          <View style={styles.leadRow}>
            <Icon name="trend" size={18} color={palette.accent} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text variant="label" tone="muted">Quoted for</Text>
              <Text variant="body" bold numberOfLines={1}>{data.lead.title}</Text>
              <Text variant="tiny" tone="faint">
                {data.lead.code}
                {data.lead.status ? ` · ${data.lead.status.name}` : ''}
              </Text>
            </View>
            <Icon name="chevronRight" size={16} color={palette.textMuted} />
          </View>
        </Card>
      ) : null}

      {canManage && data.status !== 'CONVERTED' && data.clientId ? (
        <Button
          title="Turn into an order"
          variant="dark"
          icon={<Icon name="arrowUpRight" size={17} color={palette.text} />}
          onPress={() => setConvertSheet(true)}
          style={{ marginTop: spacing.lg }}
        />
      ) : null}

      {data.status === 'CONVERTED' && data.orderId ? (
        <Button
          title="Open the order"
          variant="dark"
          onPress={() => navigation.navigate('OrderDetail', { orderId: data.orderId })}
          style={{ marginTop: spacing.lg }}
        />
      ) : null}

      {canManage ? (
        <View style={styles.actions}>
          <Button
            title="Edit"
            variant="dark"
            onPress={() => navigation.navigate('EstimateEdit', { estimateId })}
            style={{ flex: 1 }}
          />
          <Button
            title="Status"
            variant="dark"
            onPress={() => setStatusSheet(true)}
            style={{ flex: 1 }}
          />
        </View>
      ) : null}

      <ContactPickerSheet
        visible={contactSheet}
        title="Send to"
        onClose={() => setContactSheet(false)}
        onPick={(contact) => share(contact.phone)}
      />

      <Sheet
        visible={convertSheet}
        title="Turn into an order"
        subtitle={`${formatInr(data.grandTotal)} carries across unchanged`}
        onClose={() => setConvertSheet(false)}>
        <Text variant="small" tone="muted" style={{ marginBottom: spacing.md }}>
          The estimate stays as the record of what was quoted. The order starts as
          one lump sum for the agreed figure; the floor prices the real lines once
          the job is measured.
        </Text>
        <Field
          label="Site"
          placeholder="Where the work happens"
          value={location}
          onChangeText={setLocation}
          autoFocus
        />
        <Button
          title="Create the order"
          loading={converting}
          disabled={!location.trim()}
          onPress={async () => {
            setConverting(true);
            try {
              const order = await api.convertEstimate(estimateId, {
                location: location.trim(),
              });
              haptic('notificationSuccess');
              setConvertSheet(false);
              navigation.replace('OrderDetail', { orderId: order.id });
            } catch (e) {
              haptic('notificationError');
              Alert.alert(
                'Could not convert',
                e instanceof Error ? e.message : 'Unknown error',
              );
            } finally {
              setConverting(false);
            }
          }}
        />
      </Sheet>

      <Sheet visible={statusSheet} title="Quote status" onClose={() => setStatusSheet(false)}>
        {STATUSES.map((status) => (
          <SheetOption
            key={status}
            label={status}
            selected={data.status === status}
            onPress={async () => {
              setStatusSheet(false);
              await api.setEstimateStatus(estimateId, status);
              estimate.reload();
            }}
          />
        ))}
      </Sheet>
      <Text variant="label" tone="muted" style={historyStyles.label}>History</Text>
      <HistoryTimeline entries={history.data ?? []} empty="Nothing has changed since this quote was written" />
    </Screen>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.sumRow}>
      <Text variant="small" tone="muted">{label}</Text>
      <Text variant={accent ? 'h3' : 'body'} tone={accent ? 'accent' : 'default'} bold>
        {value}
      </Text>
    </View>
  );
}

/** The heading over the trail, spaced off what comes above it. */
const historyStyles = StyleSheet.create({
  label: { marginTop: spacing.xl, marginBottom: spacing.sm },
});

const styles = StyleSheet.create({
  heroFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  block: { marginTop: spacing.xl, marginBottom: spacing.md },
  line: { marginBottom: spacing.sm },
  lineTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  sumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  leadRow: { flexDirection: 'row', alignItems: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
});
