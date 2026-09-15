"""Set the native build number in a disposable CI checkout before EAS upload."""
import json
from pathlib import Path
import re
import sys


def prepare(root, requested, builds):
    if not re.fullmatch(r'[1-9][0-9]{0,8}', requested):
        raise ValueError('Use a positive integer iOS build number.')
    if not isinstance(builds, list) or not builds:
        raise ValueError('Cannot verify existing EAS builds; refusing to submit.')
    versions = [str(b.get('appBuildVersion', '')) for b in builds]
    if any(not v.isdigit() for v in versions):
        raise ValueError('Unrecognized EAS build number; review build history first.')
    project = root / 'ios/Borrowhood.xcodeproj/project.pbxproj'
    plist = root / 'ios/Borrowhood/Info.plist'
    app = root / 'app.json'
    eas = root / 'eas.json'
    project_text = project.read_text()
    plist_text = plist.read_text()
    local_versions = re.findall(r'CURRENT_PROJECT_VERSION = (\d+);', project_text)
    if not local_versions:
        raise ValueError('Native build settings were not found.')
    if int(requested) <= max(246, *map(int, versions + local_versions)):
        raise ValueError('Build number must exceed all known local and EAS builds.')
    plist_text, count = re.subn(
        r'(<key>CFBundleVersion</key>\s*<string>)[^<]*(</string>)',
        lambda m: m[1] + requested + m[2], plist_text)
    if count != 1:
        raise ValueError('Expected exactly one native CFBundleVersion.')
    app_data = json.loads(app.read_text())
    eas_data = json.loads(eas.read_text())
    app_data['expo']['ios']['buildNumber'] = requested
    eas_data['cli']['appVersionSource'] = 'local'
    eas_data['build']['testflight']['ios']['autoIncrement'] = False
    project.write_text(re.sub(r'CURRENT_PROJECT_VERSION = \d+;',
                             'CURRENT_PROJECT_VERSION = ' + requested + ';', project_text))
    plist.write_text(plist_text)
    app.write_text(json.dumps(app_data, indent=2) + '\n')
    eas.write_text(json.dumps(eas_data, indent=2) + '\n')
    print('Prepared iOS build ' + requested)


if __name__ == '__main__':
    prepare(Path(__file__).resolve().parents[1], sys.argv[1],
            json.loads(Path(sys.argv[2]).read_text()))
