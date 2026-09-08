import React from 'react';
import { EmptyState, Screen, ScreenHeader } from '../ui';

/**
 * Where alerts will land.
 *
 * A shell for now: the bell has to go somewhere, and a button that does nothing
 * is worse than one that says there is nothing yet.
 */
export function NotificationsScreen({ navigation }: { navigation: any }) {
  return (
    <Screen>
      <ScreenHeader
        title="Notifications"
        subtitle="Nothing to catch up on"
        onBack={() => navigation.goBack()}
      />
      <EmptyState
        icon="bell"
        title="No notifications yet"
        message="Moves on your orders and enquiries will show up here."
      />
    </Screen>
  );
}
