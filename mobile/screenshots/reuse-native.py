"""Reuse a recent ancestor's simulator app only when native inputs match."""
import json
import os
from pathlib import Path
import re
import subprocess

repo = os.environ['GITHUB_REPOSITORY']
run_id = ''
try:
    data = json.loads(subprocess.check_output(['gh', 'api', f'repos/{repo}/actions/artifacts?per_page=100'], text=True))
    for artifact in data.get('artifacts', []):
        if artifact['name'] != 'borrowhood-screenshot-simulator' or artifact.get('expired'):
            continue
        run = artifact.get('workflow_run', {})
        sha = run.get('head_sha', '')
        if not re.fullmatch(r'[0-9a-f]{40}', sha):
            continue
        if subprocess.run(['git', 'merge-base', '--is-ancestor', sha, 'HEAD'], capture_output=True).returncode:
            continue
        native = ['mobile/ios', 'mobile/package.json', 'mobile/package-lock.json', 'mobile/app.json', 'mobile/app.config.js', 'mobile/app.config.ts']
        if subprocess.run(['git', 'diff', '--quiet', sha, 'HEAD', '--', *native], cwd=Path(__file__).resolve().parents[2]).returncode:
            continue
        run_id = str(run['id'])
        break
except (subprocess.CalledProcessError, ValueError, KeyError):
    print('No reusable simulator archive; a fresh native build will run.')
with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
    out.write(f'run_id={run_id}\n')
print(f'Reusing native build from run {run_id}' if run_id else 'Building a fresh simulator app')
