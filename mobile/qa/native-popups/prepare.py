"""Prepare an isolated native popup rehearsal; never replace the production entry."""
from pathlib import Path
import json
import shutil
import tempfile

source = Path(__file__).resolve().parent
mobile = source.parents[1]
work = Path(tempfile.mkdtemp(prefix='borrowhood-popup-check-'))
app = work / 'app'
project = work / 'native' / 'PopupChecks.xcodeproj'
app.mkdir()
(project / 'xcshareddata' / 'xcschemes').mkdir(parents=True)
package = json.loads((mobile / 'package.json').read_text())
package['main'] = 'index.js'
(app / 'package.json').write_text(json.dumps(package))
(app / 'node_modules').symlink_to(mobile / 'node_modules', target_is_directory=True)
(app / 'app.json').write_text(json.dumps({'expo': {
    'name': 'Borrowhood popup check', 'slug': 'borrowhood-popup-check',
    'scheme': 'borrowhood', 'ios': {'bundleIdentifier': 'com.borrowhood.app'}}}))
shutil.copyfile(mobile / 'babel.config.js', app / 'babel.config.js')
(app / 'index.js').write_text((source / 'fixture.js').read_text().replace('__MOBILE_ROOT__', str(mobile)))
(app / 'metro.config.js').write_text(
    "const {getDefaultConfig}=require('expo/metro-config');const c=getDefaultConfig(__dirname);"
    f"c.watchFolders=[{json.dumps(str(mobile))}];"
    f"c.resolver.nodeModulesPaths=[{json.dumps(str(mobile / 'node_modules'))}];module.exports=c;")
shutil.copyfile(source / 'project.pbxproj', project / 'project.pbxproj')
shutil.copyfile(source / 'PopupChecks.xcscheme', project / 'xcshareddata/xcschemes/PopupChecks.xcscheme')
shutil.copyfile(source / 'PopupChecks.swift', work / 'native/PopupChecks.swift')
print(work)
