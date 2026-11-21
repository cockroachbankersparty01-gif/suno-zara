import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Song } from '../api';
import { usePlayer } from '../player';
import { colors, fmtCount, fmtTime, radius, space, type } from '../theme';
import { Cover, IconButton } from './ui';

/** One song in a list. Tapping plays it (with the whole list as the queue). */
export function SongRow({ song, list, onMore, showAuthor }: {
  song: Song; list: Song[]; onMore(song: Song): void; showAuthor?: boolean;
}) {
  const player = usePlayer();
  const isCurrent = player.current?.id === song.id;
  return (
    <Pressable
      onPress={() => (isCurrent ? player.toggle() : player.play(song, list))}
      onLongPress={() => onMore(song)}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.card }]}
    >
      <Cover uri={song.coverUrl} size={56} rounded={radius.sm}>
        {isCurrent && (
          <View style={s.overlay}>
            <Ionicons name={player.playing ? 'pause' : 'play'} size={22} color="#fff" />
          </View>
        )}
      </Cover>
      <View style={{ flex: 1, gap: 3 }}>
        <Text numberOfLines={1} style={[type.h2, isCurrent && { color: colors.accent }]}>{song.title}</Text>
        <Text numberOfLines={1} style={type.small}>
          {showAuthor && song.author ? `${song.author.displayName ?? song.author.username} · ` : ''}
          {song.styleTags.slice(0, 3).join(', ') || (song.isInstrumental ? 'Instrumental' : 'Song')}
        </Text>
        <View style={s.meta}>
          <Text style={type.tiny}>{fmtTime(song.durationSec)}</Text>
          {song.kind !== 'original' && <Text style={[type.tiny, s.badge]}>{song.kind === 'extension' ? 'EXTENDED' : 'REMIX'}</Text>}
          {song.isPublic && <Ionicons name="globe-outline" size={11} color={colors.faint} />}
          <Ionicons name="play" size={10} color={colors.faint} />
          <Text style={type.tiny}>{fmtCount(song.playCount)}</Text>
          <Ionicons name={song.likedByMe ? 'heart' : 'heart-outline'} size={11} color={song.likedByMe ? colors.accent : colors.faint} />
          <Text style={type.tiny}>{fmtCount(song.likeCount)}</Text>
        </View>
      </View>
      <IconButton icon="ellipsis-vertical" onPress={() => onMore(song)} color={colors.muted} label="More actions" />
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(2.5), paddingHorizontal: space(4), borderRadius: radius.md },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  badge: { color: colors.accent, fontWeight: '800', letterSpacing: 0.5 },
});
