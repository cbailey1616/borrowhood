"""Capture the actual native screens; never resize a phone layout into an iPad."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
from PIL import Image

app = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
output.mkdir(parents=True, exist_ok=True)
devices = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'devices', 'available', '--json']))['devices']
screens = [('01-home', 'home'), ('02-giveaway', 'giveaway'), ('03-for-sale', 'sell'), ('04-saved', 'saved'), ('05-my-posts', 'posts'), ('06-messages', 'chat')]
manifest = []

def run(*args, check=True, timeout=180):
    return subprocess.run(['xcrun', 'simctl', *args], check=check, timeout=timeout)

for folder, name, size in [('iphone-pro-max', 'iPhone 16 Pro Max', (1320, 2868)), ('ipad-pro-13', 'iPad Pro 13-inch (M4)', (2064, 2752))]:
    matches = [(runtime, device) for runtime, group in devices.items() if '.iOS-' in runtime for device in group if device['name'] == name and device.get('isAvailable')]
    if not matches:
        raise RuntimeError(f'No available simulator for {name}')
    runtime, device = sorted(matches, key=lambda match: tuple(map(int, match[0].split('iOS-')[1].split('-'))))[-1]
    udid = device['udid']
    destination = output / folder
    destination.mkdir(exist_ok=True)
    try:
        if device['state'] != 'Booted':
            run('boot', udid)
        run('bootstatus', udid, '-b', timeout=300)
        run('ui', udid, 'appearance', 'light')
        run('status_bar', udid, 'override', '--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3', '--cellularMode', 'active', '--cellularBars', '4', '--batteryState', 'discharging', '--batteryLevel', '100')
        run('install', udid, str(app))
        hashes = set()
        for filename, route in screens:
            # A launch argument selects the screen without an iOS open-link dialog.
            print(f'Capturing {name}: {route}', flush=True)
            run('launch', '--terminate-running-process', udid, 'com.borrowhood.app', '-BorrowhoodCaptureScreen', route)
            time.sleep(15)
            target = destination / f'{filename}.png'
            run('io', udid, 'screenshot', '--type=png', str(target))
            with Image.open(target) as original:
                if original.size != size:
                    raise RuntimeError(f'{name}: expected {size}, got {original.size}')
                original.convert('RGB').save(target, optimize=True)
            digest = hashlib.sha256(target.read_bytes()).hexdigest()
            if digest in hashes:
                raise RuntimeError(f'Duplicate screen on {name}; navigation needs inspection')
            hashes.add(digest)
            manifest.append({'file': str(target.relative_to(output)), 'device': name, 'runtime': runtime, 'width': size[0], 'height': size[1], 'mode': 'RGB', 'sha256': digest})
    finally:
        run('shutdown', udid, check=False)
(output / 'capture-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
