import json
from pathlib import Path
from urllib.request import urlopen
import shutil

root = Path(__file__).resolve().parent
(root / 'assets').mkdir(exist_ok=True)
for name, url in json.loads((root / 'assets.json').read_text()).items():
    if not url.startswith('https://'):
        source = (root / url).resolve()
        if not source.is_relative_to(root.resolve()) or not source.is_file():
            raise RuntimeError(f'Invalid local asset for {name}')
        shutil.copyfile(source, root / 'assets' / f'{name}{source.suffix}')
        print(f'Prepared {name}')
        continue
    with urlopen(url, timeout=45) as response:
        data = response.read()
    if not data.startswith(b'\xff\xd8'):
        raise RuntimeError(f'{name} is not a JPEG image')
    (root / 'assets' / f'{name}.jpg').write_bytes(data)
    print(f'Prepared {name}')
