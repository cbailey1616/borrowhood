const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Reduce file watching scope to avoid EMFILE errors
config.watchFolders = [__dirname];
config.resolver.blockList = [
  /node_modules\/.*\/node_modules/,
];

// Polyfill node modules for React Native
config.resolver.extraNodeModules = {
  crypto: require.resolve('expo-crypto'),
};

module.exports = config;
