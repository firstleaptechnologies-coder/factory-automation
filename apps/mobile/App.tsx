import React, { useEffect } from 'react';
import { AppState, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { ThemeProvider } from './src/theming/ThemeProvider';
import { RootNavigator } from './src/navigation';
import { flushLogs, installCrashReporting, restoreLogs } from './src/lib/logs';

export default function App() {
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
