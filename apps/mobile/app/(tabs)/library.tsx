import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MiniPlayer } from '../../src/components/MiniPlayer';
import { friendlyError, type Song } from '../../src/api';
import { SongActions } from '../../src/components/SongActions';
import { SongRow } from '../../src/components/SongRow';
import { Empty, ErrorBanner, GradientButton, Segmented } from '../../src/components/ui';
import { useGenerations } from '../../src/generations';
import { useApi } from '../../src/session';
import { colors, radius, space, type } from '../../src/theme';

export default function Library() {
  const api = useApi();
  const { libraryVersion, active } = useGenerations();
  const [tab, setTab] = useState<'mine' | 'liked'>('mine');
  const [songs, setSongs] = useState<Song[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Song | null>(null);

  // Debounce search typing.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (reset: boolean) => {
    setErr(null);
    try {
      if (tab === 'liked') {
        const r = await api.liked();
        setSongs(r.songs);
        setCursor(null);
      } else {
        const r = await api.library(reset ? null : cursor, query || undefined);
        setSongs((prev) => (reset ? r.songs : [...prev, ...r.songs]));
        setCursor(r.nextCursor);
      }
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, tab, cursor, query]);

  useEffect(() => {
    setLoading(true);
    void load(true);
  }, [tab, query, libraryVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = tab === 'liked' && query
    ? songs.filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
    : songs;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <View style={s.head}>
        <Text style={type.hero}>Library</Text>
        <Segmented options={[{ value: 'mine', label: 'My songs' }, { value: 'liked', label: 'Liked' }]} value={tab} onChange={setTab} />
        <View style={s.search}>
          <Ionicons name="search" size={18} color={colors.faint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by title"
            placeholderTextColor={colors.faint}
            style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: space(2.5) }}
          />
          {!!search && <Ionicons name="close-circle" size={18} color={colors.faint} onPress={() => setSearch('')} />}
        </View>
        {active.length > 0 && (
          <Pressable onPress={() => router.push('/create')} style={s.banner}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={[type.small, { color: colors.text, flex: 1 }]}>
              {active.length} song{active.length > 1 ? 's' : ''} being made…
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        )}
        {err && <ErrorBanner message={err} onRetry={() => load(true)} />}
      </View>

      <FlatList
        data={shown}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <SongRow song={item} list={shown} onMore={setSelected} showAuthor={tab === 'liked'} />}
        onEndReached={() => tab === 'mine' && cursor && !loading && load(false)}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.accent} onRefresh={() => { setRefreshing(true); void load(true); }} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: space(10) }} />
          ) : query ? (
            <Empty icon="search-outline" title="No matches" body={`Nothing called "${query}".`} />
          ) : tab === 'liked' ? (
            <Empty icon="heart-outline" title="No liked songs yet" body="Tap the heart on songs you love in Explore." />
          ) : (
            <Empty
              icon="musical-notes-outline"
              title="Your songs live here"
              body="Make your first song. It takes about a minute."
              action={<GradientButton title="Create a song" icon="sparkles" small onPress={() => router.push('/create')} style={{ marginTop: space(3) }} />}
            />
          )
        }
        contentContainerStyle={{ paddingBottom: space(6) }}
      />
      <SongActions
        song={selected}
        onClose={() => setSelected(null)}
        onChanged={(x) => { setSongs((p) => p.map((y) => (y.id === x.id ? x : y))); setSelected(x); }}
        onDeleted={(id) => setSongs((p) => p.filter((x) => x.id !== id))}
      />
      <MiniPlayer />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  head: { paddingHorizontal: space(4), paddingTop: space(3), gap: space(3), paddingBottom: space(2) },
  search: { flexDirection: 'row', alignItems: 'center', gap: space(2), backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: space(4) },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: colors.card, padding: space(3), borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
});
