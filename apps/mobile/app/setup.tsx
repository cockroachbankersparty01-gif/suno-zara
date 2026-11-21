import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ErrorBanner, Field, GhostButton, GradientButton } from '../src/components/ui';
import { useSession } from '../src/session';
import { colors, space, type } from '../src/theme';

/** First-run screen: where is your Suno Zara server? (Also shown if it becomes unreachable.) */
export default function Setup() {
  const { setServer, retry, status, error, serverUrl } = useSession();
  const [url, setUrl] = useState(serverUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const connect = async () => {
    let u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    setBusy(true);
    setMsg(null);
    try {
      await setServer(u);
    } catch (e: any) {
      setMsg(`Couldn't connect: ${e?.message ?? e}. Check the address and that the server is running.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinearGradient colors={[colors.accent2, colors.bg, colors.bg]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
            <View style={s.logo}>
              <Ionicons name="musical-notes" size={40} color="#fff" />
            </View>
            <Text style={type.hero}>Suno Zara</Text>
            <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>
              Turn any idea into a song. Free, forever.
            </Text>

            {status === 'serverDown' && serverUrl && (
              <View style={{ gap: space(3), alignSelf: 'stretch' }}>
                <ErrorBanner message={`Can't reach ${serverUrl}. ${error ?? ''}`} onRetry={retry} />
              </View>
            )}

            <View style={s.card}>
              <Field
                label="Server address"
                placeholder="https://your-server.trycloudflare.com"
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={connect}
                hint="The address of the Suno Zara backend (see the setup guide)."
              />
              {msg && <ErrorBanner message={msg} />}
              <GradientButton title="Connect" icon="link" loading={busy} disabled={!url.trim()} onPress={connect} />
              {status === 'serverDown' && serverUrl && <GhostButton icon="refresh" title="Try again" onPress={retry} />}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: space(6), gap: space(4) },
  logo: {
    width: 84, height: 84, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: space(2),
  },
  card: { alignSelf: 'stretch', gap: space(4), backgroundColor: colors.surface, borderRadius: 24, padding: space(5), marginTop: space(4) },
});
