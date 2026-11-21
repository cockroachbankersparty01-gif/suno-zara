import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { friendlyError } from '../../src/api';
import { ErrorBanner, Field, GhostButton, GradientButton } from '../../src/components/ui';
import { usePlayer } from '../../src/player';
import { useApi, useSession } from '../../src/session';
import { colors, gradient, radius, space, type } from '../../src/theme';
import { LinearGradient } from 'expo-linear-gradient';

export default function Profile() {
  const api = useApi();
  const { me, refreshMe, signOut, serverUrl, changeServer, config } = useSession();
  const player = usePlayer();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    setDisplayName(me.profile.displayName ?? '');
    setUsername(me.profile.username);
    setBio(me.profile.bio ?? '');
  }, [me, editing]);

  useEffect(() => {
    void refreshMe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return null;
  const p = me.profile;
  const c = me.credits;

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.updateMe({ displayName: displayName.trim(), username: username.trim().toLowerCase(), bio: bio.trim() });
      await refreshMe();
      setEditing(false);
    } catch (e: any) {
      setErr(e?.code === 'username_taken' ? 'That username is taken — try another.' : friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={s.wrap}>
        <LinearGradient colors={gradient as unknown as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{(p.displayName ?? p.username).slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={[type.title, { color: '#fff' }]}>{p.displayName ?? p.username}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.8)' }}>@{p.username}</Text>
          {!!p.bio && <Text style={{ color: '#fff', textAlign: 'center' }}>{p.bio}</Text>}
          <View style={s.stats}>
            <Stat n={p.followerCount} label="Followers" />
            <Stat n={p.followingCount} label="Following" />
          </View>
        </LinearGradient>

        <View style={s.card}>
          <View style={s.row}>
            <Ionicons name="flash" size={18} color={colors.warning} />
            <Text style={type.h2}>Free daily songs</Text>
          </View>
          {c.unlimited ? (
            <Text style={type.small}>Unlimited on this server. Enjoy!</Text>
          ) : (
            <>
              <Text style={type.body}>
                {Math.floor(c.available / c.perGeneration)} of {Math.floor(c.dailyFree / c.perGeneration)} creations left today
              </Text>
              <Text style={type.small}>Each creation makes 2 songs. Refills every day, always free.</Text>
            </>
          )}
        </View>

        {editing ? (
          <View style={s.card}>
            <Field label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={50} />
            <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" maxLength={24} hint="3–24 letters, numbers or _" />
            <Field label="Bio" value={bio} onChangeText={setBio} maxLength={280} multiline />
            {err && <ErrorBanner message={err} />}
            <GradientButton title="Save" loading={busy} onPress={save} />
            <GhostButton title="Cancel" onPress={() => setEditing(false)} style={{ alignSelf: 'center' }} />
          </View>
        ) : (
          <View style={s.card}>
            <GhostButton icon="create-outline" title="Edit profile" onPress={() => setEditing(true)} />
            <GhostButton icon="globe-outline" title="My public page" onPress={() => router.push(`/user/${p.username}`)} />
            <GhostButton icon="document-text-outline" title="Terms of Service" onPress={() => router.push('/terms')} />
          </View>
        )}

        <View style={s.card}>
          <Text style={s.label}>SETTINGS</Text>
          <View style={s.row}>
            <Ionicons name="server-outline" size={18} color={colors.muted} />
            <Text style={[type.small, { flex: 1 }]} numberOfLines={1}>{serverUrl}</Text>
          </View>
          <Text style={type.tiny}>Sign-in: {config?.authMode === 'dev' ? 'test mode' : 'Supabase'}</Text>
          <GhostButton icon="swap-horizontal" title="Change server" onPress={() => { player.stop(); changeServer(); }} />
          <GhostButton
            icon="log-out-outline"
            title="Sign out"
            danger
            onPress={() => Alert.alert('Sign out?', undefined, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => { player.stop(); void signOut(); } },
            ])}
          />
        </View>
        <Text style={[type.tiny, { textAlign: 'center' }]}>Suno Zara v{Constants.expoConfig?.version ?? '1.0.0'} · free & open-source</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{n}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space(4), gap: space(4), paddingBottom: space(10) },
  hero: { borderRadius: radius.lg, padding: space(6), alignItems: 'center', gap: space(1.5), marginTop: space(3) },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: space(2) },
  avatarText: { color: '#fff', fontSize: 34, fontWeight: '900' },
  stats: { flexDirection: 'row', gap: space(10), marginTop: space(3) },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space(4), gap: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700', letterSpacing: 0.6 },
});
