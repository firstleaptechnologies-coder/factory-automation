/**
 * expo-application, as far as the tests are concerned.
 *
 * The real module reads CFBundleVersion and CFBundleShortVersionString through
 * expo-modules-core, which Jest has no way to provide — the same reason
 * expo-updates and Reanimated are mocked beside it.
 *
 * Both values are null here, which is what a build genuinely reports when
 * there is no binary around them: Metro. The helpers in src/lib/appVersion.ts
 * are expected to cope with that rather than print "undefined" on a settings
 * screen, and these nulls are what hold them to it.
 */
module.exports = {
  nativeBuildVersion: null,
  nativeApplicationVersion: null,
  applicationId: 'com.firstleap.factoryautomation',
  applicationName: 'FAS',
};
