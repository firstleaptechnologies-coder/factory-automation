module.exports = {
  /*
   * Expo's preset rather than React Native's own.
   *
   * The app is still a bare React Native project — it just has the Expo
   * modules in it now, and expo-updates among them. This preset is what
   * resolves those modules and the virtual entry point they are registered
   * through.
   */
  presets: ['babel-preset-expo'],
  plugins: [
    // Reanimated 4 runs its worklets through this plugin. It rewrites functions
    // marked 'worklet' so they can execute on the UI thread — animations that
    // never touch the JS thread, and therefore never stutter when the app is
    // doing something else. It must stay last in the plugin list.
    'react-native-worklets/plugin',
  ],
};
