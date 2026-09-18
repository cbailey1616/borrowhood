"""Inspect only the isolated simulator refresh fixture after its color test fails."""
import subprocess
import sys

udid, destination = sys.argv[1:]
pid = subprocess.check_output(['pgrep', '-x', 'Borrowhood'], text=True).split()[-1]
commands = [
    'thread select 1',
    'expression -l objc++ -- @import UIKit;',
    'expression -l objc++ -O -- ({ UIRefreshControl *refresh = nil; NSMutableArray *queue = [NSMutableArray arrayWithArray:(NSArray *)[[UIApplication sharedApplication] windows]]; while ([queue count]) { UIView *v = [queue lastObject]; [queue removeLastObject]; if ([v isKindOfClass:[UIRefreshControl class]]) { refresh = (UIRefreshControl *)v; break; } [queue addObjectsFromArray:[v subviews]]; } [NSString stringWithFormat:@"refresh=%@ tint=%@ mode=%ld", refresh, [refresh tintColor], (long)[refresh tintAdjustmentMode]]; })',
    'process detach',
]
args = ['xcrun', 'lldb', '--batch', '-p', pid]
for command in commands:
    args += ['-o', command]
result = subprocess.run(args, text=True, capture_output=True, timeout=90)
print('NATIVE_REFRESH_DIAGNOSTIC:\n' + result.stdout + result.stderr, flush=True)
