#!/usr/bin/env bash
set -euo pipefail

# Pin the gesture driver and verify the official release archive.
archive="$RUNNER_TEMP/borrowhood-maestro.zip"
destination="$RUNNER_TEMP/borrowhood-maestro"
curl --fail --location --retry 3 \
  https://github.com/mobile-dev-inc/Maestro/releases/download/cli-2.10.0/maestro.zip \
  --output "$archive"
echo "29b675e10cc12080e445e9bfb2e2b4e4dfb9c0f2e30d5884120d258b5e1cd991  $archive" | shasum -a 256 -c -
mkdir -p "$destination"
unzip -q "$archive" -d "$destination"
echo "$destination/maestro/bin" >> "$GITHUB_PATH"
