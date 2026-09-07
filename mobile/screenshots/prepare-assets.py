import json
from pathlib import Path
from urllib.request import urlopen

root = Path(__file__).resolve().parent
(root / 'assets').mkdir(exist_ok=True)
for name, url in json.loads((root / 'assets.json').read_text()).items():
    with urlopen(url, timeout=45) as response:
        data = response.read()
    if not data.startswith(b'\xff\xd8'):
        raise RuntimeError(f'{name} is not a JPEG image')
    (root / 'assets' / f'{name}.jpg').write_bytes(data)
    print(f'Prepared {name}')
