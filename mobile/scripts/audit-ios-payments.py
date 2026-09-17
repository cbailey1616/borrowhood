"""Inspect the exact signed EAS archive before it can be sent to TestFlight."""
import json
import os
import plistlib
import re
import shutil
import sys
import tempfile
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from zipfile import ZipFile

MACHO = {bytes.fromhex(value) for value in ['cffaedfe', 'cefaedfe', 'feedfacf', 'feedface', 'cafebabe', 'cafebabf']}
FORBIDDEN = [b'PassKit.framework', b'libswiftPassKit', b'StripeCore', b'StripeIdentity',
             b'StripePayments', b'StripeApplePay', b'STPApplePayContext']


def audit_archive(archive):
    infos = [name for name in archive.namelist()
             if re.fullmatch(r'Payload/[^/]+\.app/Info\.plist', name)]
    if len(infos) != 1:
        raise ValueError('Expected one iOS application in the archive')
    info = plistlib.loads(archive.read(infos[0]))
    if info.get('CFBundleIdentifier') != 'com.borrowhood.app':
        raise ValueError('Unexpected app bundle identifier')
    main = infos[0].removesuffix('Info.plist') + info['CFBundleExecutable']
    native_files = []
    for entry in archive.infolist():
        if entry.is_dir() or not entry.filename.startswith('Payload/'):
            continue
        with archive.open(entry) as stream:
            prefix = stream.read(4)
            if prefix not in MACHO:
                continue
            data = prefix + stream.read()
        native_files.append(entry.filename)
        matches = [word.decode() for word in FORBIDDEN if word in data]
        if matches:
            raise ValueError(f'Unexpected payment dependency in {entry.filename}: {", ".join(matches)}')
    if main not in native_files:
        raise ValueError('The app executable was not inspected')
    return {'bundle': info['CFBundleIdentifier'], 'build': info['CFBundleVersion'],
            'nativeBinariesInspected': len(native_files), 'paymentDependencies': []}


def main():
    builds = json.load(open(sys.argv[1]))
    if isinstance(builds, dict):
        builds = [builds]
    if len(builds) != 1:
        raise ValueError('Expected the result of one iOS build')
    build = builds[0]
    build_id = build.get('id', '')
    if not re.fullmatch(r'[0-9a-f-]{36}', build_id) or build.get('status') != 'FINISHED':
        raise ValueError('A finished EAS build is required')
    artifacts = build.get('artifacts') or {}
    url = artifacts.get('applicationArchiveUrl') or artifacts.get('buildUrl')
    if not url or not url.startswith('https://'):
        raise ValueError('A secure application archive URL is required')
    with tempfile.TemporaryFile() as downloaded:
        try:
            # Use the same download client identifier as EAS CLI's node-fetch.
            request = Request(url, headers={'User-Agent': 'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)'})
            with urlopen(request, timeout=60) as response:
                shutil.copyfileobj(response, downloaded)
        except HTTPError as error:
            # Never put signed archive URLs or response bodies into public CI logs.
            host = urlsplit(error.url).hostname
            raise SystemExit(f'Archive download failed: HTTP {error.code} from {host}') from None
        downloaded.seek(0)
        with ZipFile(downloaded) as archive:
            report = audit_archive(archive)
    if report['build'] != str(build.get('appBuildVersion')):
        raise ValueError('The archive version does not match the requested EAS build')
    print(json.dumps({'easBuildId': build_id, **report}))
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write(f'build_id={build_id}\n')


if __name__ == '__main__':
    main()
