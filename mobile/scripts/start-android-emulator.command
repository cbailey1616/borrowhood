#!/bin/bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TOOLS="$TASK_ROOT/work/android-tools"
export ANDROID_HOME="$TOOLS/sdk"
export ANDROID_USER_HOME="$TOOLS/android-user"
export ANDROID_AVD_HOME="$TOOLS/avd"
ADB="$ANDROID_HOME/platform-tools/adb"
SERIAL=emulator-5580
trap 'echo; echo "You can leave this window open while testing."; read -r -p "Press Return to close this launcher. " unused' EXIT

if ! "$ADB" -s "$SERIAL" get-state >/dev/null 2>&1; then
  echo "Starting the Borrowhood Pixel 9a virtual phone..."
  "$ANDROID_HOME/emulator/emulator" -avd Borrowhood_Pixel_9a -port 5580 -no-audio -no-snapshot -gpu auto > "$TOOLS/emulator-launch.log" 2>&1 &
fi
echo "Waiting for Android to finish starting..."
ready=false
for attempt in $(seq 1 90); do
  if [[ "$("$ADB" -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; then
    ready=true
    break
  fi
  sleep 2
done
if [[ "$ready" != true ]]; then
  echo "Android did not finish starting. Details: $TOOLS/emulator-launch.log"
  tail -20 "$TOOLS/emulator-launch.log"
  exit 1
fi
AVD_NAME="$("$ADB" -s "$SERIAL" emu avd name | head -1 | tr -d '\r')"
if [[ "$AVD_NAME" != Borrowhood_Pixel_9a ]]; then
  echo "Another virtual phone is using port 5580; no app was installed."
  exit 1
fi
echo "Installing Borrowhood's signed test APK..."
"$ADB" -s "$SERIAL" install -r "$TOOLS/borrowhood-preview.apk"
"$ADB" -s "$SERIAL" shell am start -n com.borrowhood.app/.MainActivity
echo "Borrowhood is ready in the Android emulator."
