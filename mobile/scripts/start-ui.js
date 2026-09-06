// Start the native UI against the existing hosted API, with Fast Refresh.
const { spawn } = require('node:child_process');

const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://borrowhood-production.up.railway.app';
console.log(`Borrowhood UI preview — API: ${apiUrl}`);
console.log('The hosted API uses live data. Use a test account for listings and messages.');
console.log('Keep this terminal open and connect your iPhone to the same Wi-Fi as your Mac.\n');

const child = spawn(process.execPath, [
  require.resolve('expo/bin/cli'),
  'start', '--dev-client', '--lan', '--scheme', 'com.borrowhood.app',
  ...process.argv.slice(2),
], {
  stdio: 'inherit',
  env: { ...process.env, EXPO_PUBLIC_API_URL: apiUrl },
});

child.on('error', (error) => {
  console.error(`Could not start the UI preview: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
