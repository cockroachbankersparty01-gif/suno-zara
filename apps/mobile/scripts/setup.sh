#!/usr/bin/env bash
# Installs every dependency at the exact version that matches the Expo SDK in package.json.
# (`npx expo install` picks SDK-compatible versions, so nothing drifts or breaks.)
set -euo pipefail
cd "$(dirname "$0")/.."

npm install --no-audit --no-fund

npx expo install \
  react react-native \
  expo-router expo-system-ui expo-linking expo-constants expo-status-bar expo-splash-screen \
  react-native-safe-area-context react-native-screens \
  expo-audio expo-linear-gradient expo-web-browser expo-crypto expo-build-properties \
  @expo/vector-icons @react-native-async-storage/async-storage \
  react-native-url-polyfill @supabase/supabase-js

npx expo install --dev typescript @types/react

# Final consistency pass.
npx expo install --fix
echo "✅ Dependencies installed"
