"""Capture the actual native screens; never resize a phone layout into an iPad."""
import hashlib
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from PIL import Image

app = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
output.mkdir(parents=True, exist_ok=True)
devices = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'devices', 'available', '--json']))['devices']
screens = [('01-home', 'home'), ('02-request-details', 'request-detail'), ('03-giveaway', 'giveaway'),
           ('04-my-posts', 'posts'), ('05-inbox', 'inbox'), ('06-messages', 'chat'), ('07-comments', 'comments'), ('08-friends', 'friends')]
review_screens = [('ui-review/notifications', 'notifications'), ('ui-review/profile', 'profile'), ('ui-review/ranks', 'ranks'), ('ui-review/member-profile', 'member-profile'), ('ui-review/feedback', 'feedback'), ('ui-review/requests-text', 'requests-text'), ('ui-review/requests-photo', 'requests-photo'), ('ui-review/pending-exchange', 'pending-exchange')]
review_screens += [('ui-review/keyboard', 'keyboard'), ('ui-review/reserved-item', 'reserved-item'), ('ui-review/feed-end', 'feed-end')]
review_screens += [('ui-review/request-queue', 'request-queue'), ('ui-review/reserved-queue', 'reserved-queue'), ('ui-review/owner-pending-request', 'owner-pending-request'), ('ui-review/inbox', 'inbox')]
review_screens += [('ui-review/home-exchanges', 'home-exchanges'), ('ui-review/inbox-messages', 'inbox-messages'), ('ui-review/owner-pickup', 'owner-pickup'), ('ui-review/owner-active-item', 'owner-active-item')]
# Capture both immediate text focus and a later number-field focus. The latter
# has no return key, so the keyboard accessory is its explicit dismissal control.
review_screens = [('ui-review/keyboard', 'keyboard'), ('ui-review/keyboard-number', 'keyboard-number')] + [screen for screen in review_screens if screen[1] != 'keyboard']
refresh_screens = [('ui-review/refresh-control', 'refresh-control'), ('ui-review/refresh-remount', 'refresh-remount')]
review_screens = refresh_screens + review_screens
manifest = []
review_only = os.environ.get('BORROWHOOD_CAPTURE_REVIEW_ONLY') == 'true'
store_only = os.environ.get('BORROWHOOD_CAPTURE_STORE_ONLY') == 'true'
refresh_only = os.environ.get('BORROWHOOD_CAPTURE_REFRESH_ONLY') == 'true'
# Keep the software keyboard visible in the native keyboard-accessory capture.
subprocess.run(['defaults', 'write', 'com.apple.iphonesimulator', 'ConnectHardwareKeyboard', '-bool', 'false'], check=True)

def run(*args, check=True, timeout=180):
    return subprocess.run(['xcrun', 'simctl', *args], check=check, timeout=timeout)

def prepare_device(udid):
    run('bootstatus', udid, '-b', timeout=300)
    # Dismiss the simulator's first-use swipe-typing introduction so the
    # capture shows the real keyboard and its accessory toolbar.
    run('spawn', udid, 'defaults', 'write', 'com.apple.keyboard.preferences', 'DidShowContinuousPathIntroduction', '-bool', 'true')
    run('ui', udid, 'appearance', 'light')
    run('status_bar', udid, 'override', '--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3', '--cellularMode', 'active', '--cellularBars', '4', '--batteryState', 'discharging', '--batteryLevel', '100')

def launch_capture(udid, route):
    args = ('launch', '--terminate-running-process', udid, 'com.borrowhood.app', '-BorrowhoodCaptureScreen', route)
    try:
        run(*args)
    except subprocess.TimeoutExpired:
        # A cold hosted simulator can stall in simctl before the app launches.
        # Retry once after a clean boot; a second failure still fails the job.
        print(f'Launch timed out for {route}; restarting the simulator once', flush=True)
        run('shutdown', udid, check=False)
        run('boot', udid)
        prepare_device(udid)
        run(*args)

for folder, name, size in [('iphone-pro-max', 'iPhone 13 Pro Max', (1284, 2778)), ('ipad-pro-13', 'iPad Pro 13-inch (M4)', (2064, 2752)), ('iphone-se', 'iPhone SE (3rd generation)', (750, 1334))]:
    if store_only and folder == 'iphone-se':
        continue
    if (review_only or refresh_only) and folder == 'ipad-pro-13':
        continue
    matches = [(runtime, device) for runtime, group in devices.items() if '.iOS-' in runtime for device in group if device['name'] == name and device.get('isAvailable')]
    created_device = False
    if not matches:
        # Hosted Macs may not pre-create older screen sizes. Capture natively
        # on the requested device instead of resizing another phone's layout.
        types = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'devicetypes', '--json']))['devicetypes']
        device_type = next((item['identifier'] for item in types if item['name'] == name), None)
        runtimes = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'runtimes', '--json']))['runtimes']
        available = [item for item in runtimes if '.iOS-' in item['identifier'] and item.get('isAvailable')]
        if not device_type or not available:
            raise RuntimeError(f'No available simulator configuration for {name}')
        runtime = max(available, key=lambda item: tuple(map(int, item['version'].split('.'))))['identifier']
        udid = subprocess.check_output(['xcrun', 'simctl', 'create', f'Borrowhood capture {name}', device_type, runtime], text=True).strip()
        matches = [(runtime, {'udid': udid, 'state': 'Shutdown'})]
        created_device = True
    runtime, device = sorted(matches, key=lambda match: tuple(map(int, match[0].split('iOS-')[1].split('-'))))[-1]
    udid = device['udid']
    destination = output / folder
    destination.mkdir(exist_ok=True)
    try:
        if device['state'] != 'Booted':
            run('boot', udid)
        prepare_device(udid)
        run('install', udid, str(app))
        hashes = set()
        device_screens = refresh_screens if refresh_only else screens if store_only else review_screens if review_only or folder == 'iphone-se' else screens + (review_screens if folder == 'iphone-pro-max' else [])
        for filename, route in device_screens:
            # A launch argument selects the screen without an iOS open-link dialog.
            print(f'Capturing {name}: {route}', flush=True)
            if route.startswith('refresh-'):
                subprocess.run(['maestro', '--device', udid, 'test', '-e', f'CAPTURE_SCREEN={route}',
                                str(Path(__file__).with_name('refresh-gesture.yaml'))],
                               check=True, timeout=180,
                               env={**os.environ, 'MAESTRO_CLI_NO_ANALYTICS': '1'})
                time.sleep(2)
            else:
                launch_capture(udid, route)
                time.sleep(15)
            target = destination / f'{filename}.png'
            target.parent.mkdir(parents=True, exist_ok=True)
            run('io', udid, 'screenshot', '--type=png', str(target))
            with Image.open(target) as original:
                if original.size != size:
                    raise RuntimeError(f'{name}: expected {size}, got {original.size}')
                original.convert('RGB').save(target, optimize=True)
                if route.startswith('refresh-'):
                    # Only the real native spinner can be green on this empty
                    # fixture. Gray/default/hidden controls must fail the check.
                    wheel = original.convert('RGB').crop((size[0] * 0.35, 0, size[0] * 0.65, size[1] * 0.4))
                    green = sum(1 for r, g, b in wheel.getdata() if g < 170 and g - r >= 10 and g - b >= 7)
                    if green < 30:
                        # This fixture contains only the native wheel and system
                        # chrome. Preserve a readable diagnostic when artifact
                        # downloads are unavailable to the reviewer.
                        print('NATIVE_REFRESH_SCREENSHOT:' + base64.b64encode(target.read_bytes()).decode(), flush=True)
                        raise RuntimeError(f'{name}/{route}: native refresh spinner is not visibly green ({green} pixels)')
                    print(f'{name}/{route}: native green spinner verified ({green} pixels)', flush=True)
            digest = hashlib.sha256(target.read_bytes()).hexdigest()
            if digest in hashes and not route.startswith('refresh-'):
                raise RuntimeError(f'Duplicate screen on {name}; navigation needs inspection')
            hashes.add(digest)
            manifest.append({'file': str(target.relative_to(output)), 'device': name, 'runtime': runtime, 'width': size[0], 'height': size[1], 'mode': 'RGB', 'sha256': digest})
    finally:
        run('shutdown', udid, check=False)
        if created_device:
            run('delete', udid, check=False)
(output / 'capture-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
