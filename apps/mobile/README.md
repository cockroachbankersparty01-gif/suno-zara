# Suno Zara — mobile app (Expo, Android)

**To get an APK, follow [`../../BUILD_APK.md`](../../BUILD_APK.md).** GitHub builds it for you.

## Screens
- **Setup**: enter the server address (also shown if the server becomes unreachable)
- **Login**: test mode, or email + Google via Supabase (chosen automatically from the server's `/config`)
- **Terms**: accepted once, viewable later from Profile
- **Home**: Explore feed (Trending / New / Following), featured carousel
- **Create**: Simple (one prompt) or Custom (title, lyrics with "Write with AI", style tags), instrumental toggle,
  live progress with queue position, results with 2 versions
- **Library**: my songs and liked songs, search, infinite scroll
- **Profile**: edit profile, free daily quota, change server, sign out
- **Player**: full screen, with waveform scrubbing, ±10s, next/previous, lyrics view, like, lock-screen controls and
  background playback; a mini player sits above the tabs
- **Song menu** (long-press or ⋮): play, like, share, download MP3, rename, publish/unpublish, extend,
  remix in a new style, new cover art, view creator, delete
- **Creator page**: public songs and a follow button

## Develop on your computer
```bash
npm run setup          # installs every package at versions matching Expo SDK 58
npx expo start         # needs a development build (expo-audio background mode isn't in Expo Go)
npm run build:apk      # local APK build (needs JDK 17 + Android SDK)
```

## Layout
```
app/                  # screens (Expo Router: one file = one screen)
  (tabs)/             # Home, Create, Library, Profile
  player.tsx          # full-screen player (modal)
  user/[username].tsx # creator page
  setup.tsx login.tsx terms.tsx
src/
  api.ts              # typed backend client
  session.tsx         # server address, sign-in, profile
  player.tsx          # global audio player (expo-audio)
  generations.tsx     # tracks songs being made, polls progress
  components/         # UI kit, SongRow, SongActions, MiniPlayer, Waveform
scripts/setup.sh      # dependency install (SDK-matched)
scripts/build-apk.sh  # prebuild + gradle assembleRelease
```

The APK is signed with the standard debug key, which is fine for installing directly on phones. Publishing on the
Play Store needs your own upload key (and Google's one-time developer registration fee).
