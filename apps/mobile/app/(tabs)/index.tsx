import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { friendlyError, type Song } from '../../src/api';
import { SongActions } from '../../src/components/SongActions';
import { SongRow } from '../../src/components/SongRow';
import { Cover, Empty, ErrorBanner, GradientButton, Segmented } from '../../src/components/ui';
import { usePlayer } from '../../src/player';
import { useApi, useSession } from '../../src/session';
import { colors, radius, space, type } from '../../src/theme';

type Tab = 'trending' | 'new' | 'following';

/** Home = the Explore feed: trending, newest, and people you follow. */
export default function Home() {
  const api = useApi();
  const { me } = useSession();
  const player = usePlayer();
  const [tab, setTab] = useState<Tab>('trending');
  const [songs, setSongs] = useState<Song[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Song | null>(null);

  const load = useCallback(async (reset: boolean) => {
    setErr(null);
    try {
      const r = await api.explore(tab, reset ? 0 : next ?? 0);
      setSongs((prev) => (reset ? r.songs : [...prev, ...r.songs.filter((s) => !prev.some((p) => p.id === s.id))]));
      setNext(r.nextOffset);
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, tab, next]);

  useEffect(() => {
    setLoading(true);
    setSongs([]);
    setNext(null);
    void load(true);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const featured = songs.slice(0, 6);
  const replace = (s: Song) => setSongs((prev) => prev.map((x) => (x.id === s.id ? s : x)));

  const header = (
    <View style={{ gap: space(4), paddingHorizontal: space(4), paddingBottom: space(2) }}>
      <View style={s.top}>
        <View>
          <Text style={type.small}>Hey {me?.profile.displayName ?? me?.profile.username} 👋</Text>
          <Text style={type.hero}>Discover</Text>
        </View>
        <GradientButton title="Create" icon="sparkles" small onPress={() => router.push('/create')} />
      </View>
      <Segmented
        options={[{ value: 'trending', label: '🔥 Trending' }, { value: 'new', label: 'New' }, { value: 'following', label: 'Following' }]}
        value={tab}
        onChange={setTab}
      />
      {err && <ErrorBanner message={err} onRetry={() => load(true)} />}
      {tab === 'trending' && featured.length > 0 && (
        <FlatList
          horizontal
          data={featured}
          keyExtractor={(i) => `f-${i.id}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space(3) }}
          renderItem={({ item }) => (
            <Pressable onPress={() => player.play(item, songs)} onLongPress={() => setSelected(item)} style={{ width: 150, gap: space(1.5) }}>
              <Cover uri={item.coverUrl} size={150} rounded={radius.md} />
              <Text numberOfLines={1} style={[type.body, { fontWeight: '700' }]}>{item.title}</Text>
              <Text numberOfLines={1} style={type.tiny}>{item.author?.displayName ?? item.author?.username}</Text>
            </Pressable>
          )}
        />
      )}
      {songs.length > 0 && <Text style={type.h2}>{tab === 'trending' ? 'Top songs' : tab === 'new' ? 'Just made' : 'From people you follow'}</Text>}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <FlatList
        data={songs}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => <SongRow song={item} list={songs} onMore={setSelected} showAuthor />}
        onEndReached={() => next !== null && !loading && load(false)}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.accent} onRefresh={() => { setRefreshing(true); void load(true); }} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: space(10) }} />
          ) : (
            <Empty
              icon={tab === 'following' ? 'people-outline' : 'musical-notes-outline'}
              title={tab === 'following' ? 'Nothing here yet' : 'No public songs yet'}
              body={tab === 'following' ? 'Follow creators from their songs to see their new music here.' : 'Be the first! Make a song and publish it to Explore.'}
            />
          )
        }
        contentContainerStyle={{ paddingBottom: space(6) }}
      />
      <SongActions song={selected} onClose={() => setSelected(null)} onChanged={(x) => { replace(x); setSelected(x); }} onDeleted={(id) => setSongs((p) => p.filter((x) => x.id !== id))} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: space(3) },
});
