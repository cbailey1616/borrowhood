const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Keep Expo defaults: SDK dependencies may legitimately be nested.

// Polyfill node modules for React Native
config.resolver.extraNodeModules = {
  crypto: require.resolve('expo-crypto'),
};

// Only the separately built simulator screenshot entry uses fictional data.
// Normal EAS profiles never set this variable and keep the production modules.
if (process.env.BORROWHOOD_SCREENSHOTS === '1') {
  const path = require('path');
  const replacements = new Map([
    [path.resolve(__dirname, 'src/services/api.js'), path.resolve(__dirname, 'screenshots/api.js')],
    [path.resolve(__dirname, 'src/context/AuthContext.js'), path.resolve(__dirname, 'screenshots/AuthContext.js')],
    [path.resolve(__dirname, 'src/utils/draftStorage.js'), path.resolve(__dirname, 'screenshots/draftStorage.js')],
  ]);
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === 'expo-notifications') {
      return { type: 'sourceFile', filePath: path.resolve(__dirname, 'screenshots/notifications.js') };
    }
    const resolved = context.resolveRequest(context, moduleName, platform);
    return resolved.type === 'sourceFile' && replacements.has(resolved.filePath)
      ? { ...resolved, filePath: replacements.get(resolved.filePath) }
      : resolved;
  };
}

module.exports = config;
