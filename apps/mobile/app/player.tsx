import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SongActions } from '../src/components/SongActions';
import { Cover, IconButton } from '../src/components/ui';
import { Waveform } from '../src/components/Waveform';
import { usePlayer } from '../src/player';
import { useApi } from '../src/session';
import { colors, fmtTime, radius, space, type } from '../src/theme';

/** Full-screen player: cover, waveform scrubber, controls, lyrics. */
export default function Player() {
  const p = usePlayer();
  const api = useApi();
  const { width } = useWindowDimensions();
  const [showLyrics, setShowLyrics] = useState(false);
  const [menu, setMenu] = useState(false);
  const song = p.current;

  useEffect(() => {
    if (!song) router.back();
  }, [song]);
  if (!song) return null;

  const progress = p.duration ? p.position / p.duration : 0;
  const coverSize = Math.min(width - space(16), 360);
  const toggleLike = async () => {
    try {
      const r = song.likedByMe ? await api.unlike(song.id) : await api.like(song.id);
      p.patchSong({ id: song.id, likedByMe: r.liked, likeCount: r.likeCount });
    } catch {}
  };

  return (
    <LinearGradient colors={[colors.accent2, colors.bg, colors.bg]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.top}>
          <IconButton icon="chevron-down" size={28} onPress={() => router.back()} label="Close player" />
          <Text style={[type.small, { fontWeight: '700', color: colors.text }]}>
            {p.queue.length > 1 ? `${p.queue.findIndex((x) => x.id === song.id) + 1} of ${p.queue.length}` : 'Now playing'}
          </Text>
          <IconButton icon="ellipsis-horizontal" size={24} onPress={() => setMenu(true)} label="More" />
        </View>

        <ScrollView contentContainerStyle={s.body}>
          {showLyrics && song.lyrics ? (
            <View style={[s.lyrics, { minHeight: coverSize }]}>
              <Text style={s.lyricsText}>{song.lyrics}</Text>
            </View>
          ) : (
            <View style={s.shadow}>
              <Cover uri={song.coverUrl} size={coverSize} rounded={radius.lg} />
            </View>
          )}

          <View style={s.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={type.title} numberOfLines={2}>{song.title}</Text>
              <Pressable onPress={() => song.author && router.push(`/user/${song.author.username}`)}>
                <Text style={[type.body, { color: colors.muted }]} numberOfLines={1}>
                  {song.author?.displayName ?? song.author?.username ?? 'You'} · {song.styleTags.slice(0, 3).join(', ')}
                </Text>
              </Pressable>
            </View>
            <IconButton
              icon={song.likedByMe ? 'heart' : 'heart-outline'}
              size={28}
              color={song.likedByMe ? colors.accent : colors.text}
              onPress={toggleLike}
              label="Like"
            />
          </View>

          <View style={{ alignSelf: 'stretch', gap: space(2) }}>
            <Waveform peaks={song.waveform} progress={progress} onSeek={(f) => p.seek(f * p.duration)} height={64} />
            <View style={s.times}>
              <Text style={type.tiny}>{fmtTime(p.position)}</Text>
              <Text style={type.tiny}>{fmtTime(p.duration)}</Text>
            </View>
          </View>

          <View style={s.controls}>
            <IconButton icon="play-skip-back" size={30} onPress={p.previous} label="Previous" />
            <IconButton icon="play-back" size={26} onPress={() => p.seek(p.position - 10)} label="Back 10 seconds" />
            <Pressable onPress={p.toggle} style={s.playBtn} accessibilityLabel={p.playing ? 'Pause' : 'Play'}>
              {p.buffering && !p.playing ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Ionicons name={p.playing ? 'pause' : 'play'} size={34} color={colors.bg} style={!p.playing && { marginLeft: 4 }} />
              )}
            </Pressable>
            <IconButton icon="play-forward" size={26} onPress={() => p.seek(p.position + 10)} label="Forward 10 seconds" />
            <IconButton icon="play-skip-forward" size={30} onPress={p.next} color={p.queue.length > 1 ? colors.text : colors.faint} label="Next" />
          </View>

          {!!song.lyrics && (
            <Pressable onPress={() => setShowLyrics((v) => !v)} style={s.lyricsBtn}>
              <Ionicons name={showLyrics ? 'image-outline' : 'text-outline'} size={16} color={colors.text} />
              <Text style={{ color: colors.text, fontWeight: '700' }}>{showLyrics ? 'Show cover' : 'Show lyrics'}</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
      {menu && <SongActions song={song} onClose={() => setMenu(false)} onChanged={(x) => p.patchSong(x)} />}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(3), paddingTop: space(2) },
  body: { alignItems: 'center', padding: space(6), gap: space(6) },
  shadow: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 16, borderRadius: radius.lg },
  lyrics: { alignSelf: 'stretch', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: radius.lg, padding: space(5) },
  lyricsText: { color: colors.text, fontSize: 17, lineHeight: 28, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: space(3) },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
  playBtn: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  lyricsBtn: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(5), paddingVertical: space(2.5), borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.1)' },
});
