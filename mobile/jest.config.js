module.exports = {
  preset: 'jest-expo',
  modulePaths: [require('path').join(require('path').dirname(require.resolve('expo/package.json')), 'node_modules')],
  setupFiles: ['./jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@stripe/.*|@gorhom/.*)',
  ],
  moduleNameMapper: {
    '\\.svg$': '<rootDir>/__mocks__/fileMock.js',
    '\\.png$': '<rootDir>/__mocks__/fileMock.js',
    '\\.jpg$': '<rootDir>/__mocks__/fileMock.js',
  },
  testPathIgnorePatterns: ['/node_modules/', '/.maestro/', '__tests__/setup/'],
  testTimeout: 20000,
};
