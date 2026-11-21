import { Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GenerationsProvider } from '../src/generations';
import { PlayerProvider } from '../src/player';
import { SessionProvider, useSession } from '../src/session';
import { colors } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Sends the user to the right place for their session state. */
function Gate() {
  const { status } = useSession();
  const segments = useSegments();
  const top = segments[0] as string | undefined;

  useEffect(() => {
    if (status === 'loading') return;
    SplashScreen.hideAsync().catch(() => {});
    const target =
      status === 'needsServer' || status === 'serverDown' ? 'setup'
      : status === 'signedOut' ? 'login'
      : status === 'needsTos' ? 'terms'
      : null;
    if (target) {
      if (top !== target) router.replace(`/${target}`);
    } else if (!top || top === 'setup' || top === 'login' || top === 'index') {
      // ('terms' is left alone: signed-in users can open it from Profile.)
      router.replace('/(tabs)');
    }
  }, [status, top]);

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="light" />
        <SessionProvider>
          <GenerationsProvider>
            <PlayerProvider>
              <Gate />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.bg },
                  animation: 'fade',
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="setup" />
                <Stack.Screen name="login" />
                <Stack.Screen name="terms" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="player" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                <Stack.Screen name="user/[username]" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="auth-callback" />
              </Stack>
            </PlayerProvider>
          </GenerationsProvider>
        </SessionProvider>
      </View>
    </SafeAreaProvider>
  );
}
