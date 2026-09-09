import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import type { Lead } from '@fas/shared';
import { api } from '../api/client';
import { usePaginated } from '../hooks/usePaginated';
import {
  Card,
  EmptyState,
  Icon,
  ListFooter,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Text,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatInr, relativeTime } from '../lib/format';

/**
 * Enquiries that went quiet.
 *
 * Nothing was deleted and nothing needs restoring: a lead lands here by having
 * sat untouched longer than the pipeline allows, and leaves the moment somebody
 * touches it again. So the way back is simply to open one and do something.
 */
export function ArchivedLeadsScreen({ navigation }: { navigation: any }) {
  const leads = usePaginated<Lead>(
    (page) => api.leads({ archived: true, page, limit: 25 }),
    [],
  );

  return (
    <Screen refreshing={leads.refreshing} onRefresh={leads.refresh} onEndReached={leads.loadMore}>
      <ScreenHeader
        title="Archived"
        subtitle={`${leads.total} gone quiet`}
        onBack={() => navigation.goBack()}
      />

      <Text variant="tiny" tone="faint" style={styles.hint}>
        Enquiries nobody has touched for longer than the pipeline allows. Open one
        and do anything at all — a note, a call, a move — and it goes back on the
        board.
      </Text>

      {leads.loading ? (
        <Loader />
      ) : leads.items.length === 0 ? (
        <EmptyState
          icon="trend"
          title="Nothing has gone quiet"
          message="Every enquiry has been touched inside the window."
        />
      ) : (
        leads.items.map((lead, index) => (
          <Animated.View
            key={lead.id}
            entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(320)}
            layout={Layout.springify()}>
            <Card
              tone="dark"
              style={styles.card}
              onPress={() => navigation.navigate('LeadDetail', { leadId: lead.id })}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text variant="h3" numberOfLines={1}>{lead.title}</Text>
                  <Text variant="tiny" tone="muted" numberOfLines={1}>
                    {lead.code} · last touched {relativeTime(lead.updatedAt)}
                  </Text>
                </View>
                <Pill label={lead.status.name} color={lead.status.color} small />
              </View>

              <View style={styles.metaRow}>
                <Icon name="user" size={13} color={palette.textFaint} />
                <Text variant="tiny" tone="faint" numberOfLines={1} style={styles.meta}>
                  {lead.contactName ?? lead.client?.name ?? '—'}
                  {lead.contactPhone ? ` · ${lead.contactPhone}` : ''}
                </Text>
                {lead.estimatedValue ? (
                  <Text variant="tiny" tone="muted" bold>
                    {formatInr(Number(lead.estimatedValue))}
                  </Text>
                ) : null}
              </View>
            </Card>
          </Animated.View>
        ))
      )}

      <ListFooter
        loading={leads.loadingMore}
        hasMore={leads.hasMore}
        shown={leads.items.length}
        total={leads.total}
        noun="enquiries"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { marginBottom: spacing.lg, lineHeight: 17 },
  card: { marginBottom: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.sm },
  meta: { marginLeft: 4, flex: 1 },
});
