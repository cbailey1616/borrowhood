const { spawn } = require('node:child_process');
console.log('Borrowhood Mac preview · UI 04 · sample data only');
console.log('Open http://localhost:8092. Keep this window open while reviewing.');
const child = spawn(process.execPath, [require.resolve('expo/bin/cli'), 'start', '--web', '--localhost', '--port', '8092', ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
