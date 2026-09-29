import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import type { Lead, LeadSource, Workflow } from '@fas/shared';
import { PERMISSIONS } from '@fas/shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { usePaginated } from '../hooks/usePaginated';
import {
  Card,
  Chip,
  EmptyState,
  Field,
  Icon,
  ListFooter,
  Loader,
  Pill,
  RoundButton,
  Screen,
  ScreenHeader,
  Sheet,
  SheetOption,
  Text,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatInr, relativeTime } from '../lib/format';

/**
 * Enquiries as a list.
 *
 * The bar opens this rather than the board for the same reason its Orders tab
 * does: looking one up — by name, by phone, by where it came from — is the
 * common errand, and pushing the pipeline along is the occasional one.
 *
 * The header carries the two things done from here often enough to deserve a
 * thumb: taking a new enquiry, and everything else. The filters are not in a
 * sheet, because a sheet hides what is currently on — somebody scrolls a list
 * that is quietly filtered and concludes the enquiry is missing. As chips they
 * are always readable, and clearing one is a tap rather than a sheet, an
 * unpick and an Apply.
 */
export function LeadsScreen({ route, navigation }: { route?: any; navigation: any }) {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [statusId, setStatusId] = useState<string | null>(
    (route?.params as { statusId?: string } | undefined)?.statusId ?? null,
  );
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  const workflow = useApi<Workflow>(() => api.defaultWorkflow('LEAD'), []);
  const sources = useApi<LeadSource[]>(() => api.leadSources(), []);

  const leads = usePaginated<Lead>(
    (page) =>
      api.leads({
        search: search || undefined,
        statusId: statusId ?? undefined,
        sourceId: sourceId ?? undefined,
        page,
        limit: 25,
      }),
    [search, statusId, sourceId],
  );

  return (
    <Screen
      refreshing={leads.refreshing}
      onRefresh={leads.refresh}
      onEndReached={leads.loadMore}
      /* Same as the orders list: what you work the list with stays put. */
      sticky={
        <>
          <ScreenHeader
            title="Leads"
            subtitle={`${leads.total} enquir${leads.total === 1 ? 'y' : 'ies'}`}
            right={
              <View style={styles.headerActions}>
                {can(PERMISSIONS.LEAD_CREATE) ? (
                  <RoundButton
                    icon="plus"
                    size={42}
                    testID="new-lead-button"
                    accessibilityLabel="New lead"
                    onPress={() => navigation.navigate('LeadCreate')}
                  />
                ) : null}
                <RoundButton
                  icon="more"
                  size={42}
                  testID="leads-menu-button"
                  accessibilityLabel="More"
                  onPress={() => setMenu(true)}
                />
              </View>
            }
          />

          <Field
            placeholder="Name, phone or what it is for"
            value={search}
            onChangeText={setSearch}
            icon="search"
          />

          {/*
            Two rails, one per thing a list is narrowed by. Each scrolls
            sideways because a shop with fourteen stages should not lose the
            list to a wall of chips, and the leading chip names the rail — so
            "All stages" says what the row is as well as clearing it.
          */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            testID="stage-filters"
            contentContainerStyle={styles.filterRow}>
            <Chip
              label="All stages"
              selected={!statusId}
              onPress={() => setStatusId(null)}
            />
            {(workflow.data?.statuses ?? []).map((status) => (
              <Chip
                key={status.id}
                label={status.name}
                accent={status.color}
                selected={statusId === status.id}
                testID={`stage-${status.id}`}
                onPress={() => setStatusId(statusId === status.id ? null : status.id)}
              />
            ))}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            testID="source-filters"
            contentContainerStyle={[styles.filterRow, styles.lastFilterRow]}>
            <Chip
              label="All sources"
              selected={!sourceId}
              onPress={() => setSourceId(null)}
            />
            {(sources.data ?? []).map((source) => (
              <Chip
                key={source.id}
                label={source.name}
                accent={source.color}
                selected={sourceId === source.id}
                testID={`source-${source.id}`}
                onPress={() => setSourceId(sourceId === source.id ? null : source.id)}
              />
            ))}
          </ScrollView>
        </>
      }>
      {leads.loading ? (
        <Loader />
      ) : leads.items.length === 0 ? (
        <EmptyState
          icon="trend"
          title="No enquiries match"
          message="Try clearing the search or filters."
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
                    {lead.code} · {relativeTime(lead.createdAt)}
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
              </View>

              {lead.location ? (
                <View style={styles.metaRow}>
                  <Icon name="pin" size={13} color={palette.textFaint} />
                  <Text variant="tiny" tone="faint" numberOfLines={1} style={styles.meta}>
                    {lead.location}
                  </Text>
                </View>
              ) : null}

              <View style={styles.footRow}>
                {lead.source ? (
                  <Pill label={lead.source.name} color={lead.source.color ?? palette.surfaceLit} small />
                ) : null}
                <View style={{ flex: 1 }} />
                {lead.convertedOrder ? (
                  <Text variant="tiny" tone="success" bold>
                    → {lead.convertedOrder.code}
                  </Text>
                ) : lead.estimatedValue ? (
                  <Text variant="small" tone="accent" bold>
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

      {/* The other two ways of looking at the same pipeline. Neither is a
          daily errand, so neither earns a button of its own. */}
      <Sheet visible={menu} onClose={() => setMenu(false)} title="Leads">
        <SheetOption
          label="Board view"
          description="The same enquiries arranged by stage"
          onPress={() => {
            setMenu(false);
            navigation.navigate('LeadBoard');
          }}
        />
        <SheetOption
          label="Archived"
          description="Enquiries that went quiet"
          onPress={() => {
            setMenu(false);
            navigation.navigate('ArchivedLeads');
          }}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filterRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  lastFilterRow: { marginBottom: spacing.sm },
  card: { marginBottom: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  meta: { marginLeft: 4, flex: 1 },
  footRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.sm },
});
