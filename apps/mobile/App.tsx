import React, { useEffect } from 'react';
import { AppState, StatusBar } from 'react-native';
import * as Updates from 'expo-updates';
import { useUpdates } from 'expo-updates';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { ThemeProvider } from './src/theming/ThemeProvider';
import { RootNavigator } from './src/navigation';
import { flushLogs, installCrashReporting, restoreLogs } from './src/lib/logs';
import { ensureRolloutBucket } from './src/lib/ota';

export default function App() {
  /*
   * Take an update as soon as one has been downloaded.
   *
   * expo-updates fetches on launch and would otherwise apply it on the *next*
   * cold start, which on a shop floor can be days — the phone stays open all
   * shift. Reloading here means a fix reaches the floor the day it is
   * published, and reloading is safe at this point because nothing is in
   * flight: no punch half-entered, no payment being recorded.
   */
  const { isUpdatePending } = useUpdates();

  useEffect(() => {
    if (isUpdatePending && Updates.isEnabled) {
      Updates.reloadAsync().catch(() => {
        // Best effort. If it will not reload, the bundle already running is
        // still a working app, and the update applies on the next cold start.
      });
    }
  }, [isUpdatePending]);

  useEffect(() => {
    /*
     * What this device saw, told to somebody who can act on it.
     *
     * Installed once, at the top, before anything can crash: whatever could
     * not be sent last time is picked up first, and the queue is emptied again
     * whenever the app comes back to the front — which is usually the moment
     * the network came back with it.
     */
    installCrashReporting();
    void restoreLogs().then(flushLogs);
    // Which install this is, for a staged rollout. Set once, then persisted.
    void ensureRolloutBucket();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flushLogs();
    });
    return () => subscription.remove();
  }, []);

  return (
    // Gesture handler must wrap the whole tree for the board's drag to work.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <AuthProvider>
          <ThemeProvider>
            <RootNavigator />
          </ThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
