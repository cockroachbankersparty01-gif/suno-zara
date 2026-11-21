#!/usr/bin/env bash
# Builds a release APK locally (needs JDK 17 + Android SDK). GitHub Actions runs this same script.
set -euo pipefail
cd "$(dirname "$0")/.."

npx expo prebuild --platform android --clean --no-install
cd android
chmod +x gradlew
./gradlew assembleRelease --no-daemon
mkdir -p ../dist
cp app/build/outputs/apk/release/app-release.apk ../dist/SunoZara.apk
echo "✅ APK at apps/mobile/dist/SunoZara.apk"
