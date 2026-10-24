#!/bin/bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TOOLS="$TASK_ROOT/work/android-tools"
MOBILE="$(cd "$(dirname "$0")/.." && pwd)"
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
if [[ -f "$TOOLS/borrowhood-development.apk" ]]; then
  echo "Installing Borrowhood's development APK..."
  "$ADB" -s "$SERIAL" install -r "$TOOLS/borrowhood-development.apk"
  "$ADB" -s "$SERIAL" reverse tcp:8097 tcp:8097
  if ! curl --silent --fail http://127.0.0.1:8097/status | grep -q 'packager-status:running'; then
    (cd "$MOBILE" && EXPO_PUBLIC_API_URL=https://borrowhood-production.up.railway.app npx expo start --dev-client --localhost --port 8097 > "$TOOLS/metro.log" 2>&1) &
    for attempt in $(seq 1 60); do
      if curl --silent --fail http://127.0.0.1:8097/status | grep -q 'packager-status:running'; then break; fi
      sleep 1
    done
  fi
  "$ADB" -s "$SERIAL" shell 'am start -a android.intent.action.VIEW -d "borrowhood://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8097&__expo_disable_fab=1&__expo_disable_auto_launch=1&__expo_disable_onboarding=1" com.borrowhood.app'
else
  echo "Installing Borrowhood's signed test APK..."
  "$ADB" -s "$SERIAL" install -r "$TOOLS/borrowhood-preview.apk"
  "$ADB" -s "$SERIAL" shell am start -n com.borrowhood.app/.MainActivity
fi
echo "Borrowhood is ready in the Android emulator."
