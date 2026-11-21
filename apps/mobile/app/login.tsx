import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ErrorBanner, Field, GhostButton, GradientButton, Segmented } from '../src/components/ui';
import { useSession } from '../src/session';
import { colors, radius, space, type } from '../src/theme';

export default function Login() {
  const { config, signInDev, signInEmail, signUpEmail, signInGoogle, serverUrl, changeServer } = useSession();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  };

  const submitEmail = () =>
    run('email', async () => {
      if (!email.includes('@') || password.length < 6) throw new Error('Enter your email and a password of at least 6 characters.');
      if (mode === 'signin') await signInEmail(email, password);
      else if ((await signUpEmail(email, password)) === 'check_email') {
        setMsg({ ok: true, text: 'Check your email to confirm your account, then sign in.' });
        setMode('signin');
      }
    });

  const dev = config?.authMode === 'dev';

  return (
    <LinearGradient colors={[colors.accent2, colors.bg, colors.bg]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
            <Text style={type.hero}>Welcome 👋</Text>
            <Text style={[type.body, { color: colors.muted }]}>Sign in to start making songs.</Text>

            <View style={s.card}>
              {dev ? (
                <>
                  <View style={s.devNote}>
                    <Ionicons name="construct-outline" size={18} color={colors.warning} />
                    <Text style={[type.small, { flex: 1 }]}>
                      This server is in test mode (AUTH_MODE=dev). You'll get a test account tied to this phone.
                    </Text>
                  </View>
                  <GradientButton title="Continue" icon="arrow-forward" loading={busy === 'dev'} onPress={() => run('dev', signInDev)} />
                </>
              ) : (
                <>
                  <Pressable
                    onPress={() => run('google', signInGoogle)}
                    disabled={!!busy}
                    style={({ pressed }) => [s.google, pressed && { opacity: 0.85 }]}
                  >
                    <Ionicons name="logo-google" size={20} color="#111" />
                    <Text style={s.googleText}>{busy === 'google' ? 'Opening Google…' : 'Continue with Google'}</Text>
                  </Pressable>

                  <View style={s.or}>
                    <View style={s.line} /><Text style={type.tiny}>OR</Text><View style={s.line} />
                  </View>

                  <Segmented
                    options={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]}
                    value={mode}
                    onChange={setMode}
                  />
                  <Field placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
                  <Field placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submitEmail} />
                  <GradientButton title={mode === 'signin' ? 'Sign in' : 'Create account'} loading={busy === 'email'} onPress={submitEmail} />
                </>
              )}
              {msg && (msg.ok
                ? <Text style={[type.small, { color: colors.success }]}>{msg.text}</Text>
                : <ErrorBanner message={msg.text} />)}
            </View>

            <GhostButton
              icon="server-outline"
              title={`Server: ${serverUrl?.replace(/^https?:\/\//, '') ?? '—'}  ·  Change`}
              onPress={changeServer}
              style={{ alignSelf: 'center' }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: space(6), gap: space(3) },
  card: { gap: space(4), backgroundColor: colors.surface, borderRadius: radius.lg, padding: space(5), marginTop: space(4) },
  google: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(3),
    backgroundColor: '#fff', borderRadius: radius.pill, paddingVertical: space(4),
  },
  googleText: { color: '#111', fontWeight: '800', fontSize: 16 },
  or: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  devNote: { flexDirection: 'row', gap: space(2), alignItems: 'center', backgroundColor: 'rgba(255,181,71,0.1)', padding: space(3), borderRadius: radius.md },
});
