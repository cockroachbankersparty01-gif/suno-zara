import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { friendlyError, type Profile, type Song } from '../../src/api';
import { SongActions } from '../../src/components/SongActions';
import { SongRow } from '../../src/components/SongRow';
import { Empty, ErrorBanner, GhostButton, GradientButton, IconButton } from '../../src/components/ui';
import { useApi, useSession } from '../../src/session';
import { colors, radius, space, type } from '../../src/theme';

/** A creator's public page: their published songs + follow button. */
export default function UserPage() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const api = useApi();
  const { me } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Song | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [p, s] = await Promise.all([api.user(username), api.userSongs(username)]);
      setProfile(p.profile);
      setSongs(s.songs);
    } catch (e) {
      setErr(friendlyError(e));
    }
  }, [api, username]);

  useEffect(() => {
    void load();
  }, [load]);

  const isMe = profile?.id === me?.profile.id;
  const toggleFollow = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      const r = profile.followedByMe ? await api.unfollow(profile.username) : await api.follow(profile.username);
      setProfile({ ...profile, followedByMe: r.following, followerCount: profile.followerCount + (r.following ? 1 : -1) });
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={s.top}>
        <IconButton icon="chevron-back" size={26} onPress={() => router.back()} label="Back" />
      </View>
      {!profile && !err ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: space(10) }} />
      ) : (
        <FlatList
          data={songs}
          keyExtractor={(i) => i.id}
          ListHeaderComponent={
            <View style={s.head}>
              {err && <ErrorBanner message={err} onRetry={load} />}
              {profile && (
                <>
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>{(profile.displayName ?? profile.username).slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <Text style={type.title}>{profile.displayName ?? profile.username}</Text>
                  <Text style={type.small}>@{profile.username} · {profile.followerCount} followers</Text>
                  {!!profile.bio && <Text style={[type.body, { textAlign: 'center', color: colors.muted }]}>{profile.bio}</Text>}
                  {!isMe && (profile.followedByMe
                    ? <GhostButton title="Following ✓" onPress={toggleFollow} style={s.followingBtn} />
                    : <GradientButton title="Follow" icon="person-add" small loading={busy} onPress={toggleFollow} />)}
                </>
              )}
            </View>
          }
          renderItem={({ item }) => <SongRow song={item} list={songs} onMore={setSelected} />}
          ListEmptyComponent={profile ? <Empty icon="musical-notes-outline" title="No public songs yet" /> : null}
          contentContainerStyle={{ paddingBottom: space(10) }}
        />
      )}
      <SongActions
        song={selected}
        onClose={() => setSelected(null)}
        onChanged={(x) => { setSongs((p) => p.map((y) => (y.id === x.id ? x : y))); setSelected(x); }}
        onDeleted={(id) => setSongs((p) => p.filter((x) => x.id !== id))}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { paddingHorizontal: space(2), paddingTop: space(1) },
  head: { alignItems: 'center', gap: space(2), padding: space(5) },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.accent2, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 38, fontWeight: '900' },
  followingBtn: { backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: space(6) },
});
