"""Inspect only the isolated simulator refresh fixture after its color test fails."""
import base64
from pathlib import Path
import subprocess
import sys
import time

udid, destination = sys.argv[1:]
pid = subprocess.check_output(['pgrep', '-x', 'Borrowhood'], text=True).split()[-1]
commands = [
    'thread select 1',
    'expression -l objc++ -- @import UIKit;',
    'expression -l objc++ -- id $bhRefresh = nil;',
    'expression -l objc++ -- NSMutableArray *$bhQueue = [NSMutableArray arrayWithArray:[[UIApplication sharedApplication] windows]];',
    'expression -l objc++ -- while ([$bhQueue count]) { UIView *v = [$bhQueue lastObject]; [$bhQueue removeLastObject]; if ([v isKindOfClass:[UIRefreshControl class]]) { $bhRefresh = v; break; } [$bhQueue addObjectsFromArray:[v subviews]]; }',
    'expression -l objc++ -O -- $bhRefresh',
    'expression -l objc++ -O -- [$bhRefresh tintColor]',
    'expression -l objc++ -O -- [$bhRefresh recursiveDescription]',
    'expression -l objc++ -- (long)[$bhRefresh tintAdjustmentMode]',
    'expression -l objc++ -- [$bhRefresh setTintColor:[UIColor colorWithRed:0 green:1 blue:0 alpha:1]];',
    'expression -l objc++ -- [$bhRefresh tintColorDidChange];',
    'expression -l objc++ -O -- [$bhRefresh tintColor]',
    'process detach',
]
args = ['xcrun', 'lldb', '--batch', '-p', pid]
for command in commands:
    args += ['-o', command]
result = subprocess.run(args, text=True, capture_output=True, timeout=90)
print('NATIVE_REFRESH_DIAGNOSTIC:\n' + result.stdout + result.stderr, flush=True)
time.sleep(2)
target = Path(destination).with_name('refresh-diagnostic.png')
subprocess.run(['xcrun', 'simctl', 'io', udid, 'screenshot', '--type=png', str(target)], check=True)
print('NATIVE_REFRESH_DIAGNOSTIC_SCREENSHOT:' + base64.b64encode(target.read_bytes()).decode(), flush=True)
