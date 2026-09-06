const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const workspaceRoot = path.resolve(__dirname, '../..');
const sharedSrc = path.resolve(workspaceRoot, 'packages/shared/src');

/**
 * The app keeps its own node_modules (bare RN needs that for autolinking), but
 * still compiles @decor/shared straight from source in the monorepo.
 */
const config = {
  watchFolders: [sharedSrc],
  resolver: {
    extraNodeModules: {
      '@decor/shared': sharedSrc,
    },
    // Anything else must resolve from this app's own node_modules, so a stray
    // second copy of React in the workspace root cannot be picked up.
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
