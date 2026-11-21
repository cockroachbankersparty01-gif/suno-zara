import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePlayer } from '../player';
import { colors, radius, space, type } from '../theme';
import { Cover, IconButton } from './ui';

/** Persistent player bar shown above the tabs. Tap to open the full-screen player. */
export function MiniPlayer() {
  const p = usePlayer();
  if (!p.current) return null;
  const progress = p.duration ? p.position / p.duration : 0;
  return (
    <Pressable onPress={() => router.push('/player')} style={s.wrap}>
      <View style={s.row}>
        <Cover uri={p.current.coverUrl} size={42} rounded={radius.sm} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[type.body, { fontWeight: '700' }]}>{p.current.title}</Text>
          <Text numberOfLines={1} style={type.tiny}>
            {p.buffering ? 'Loading…' : p.current.author?.displayName ?? p.current.styleTags.slice(0, 2).join(', ')}
          </Text>
        </View>
        <IconButton icon={p.playing ? 'pause' : 'play'} size={26} onPress={p.toggle} label={p.playing ? 'Pause' : 'Play'} />
        <IconButton icon="play-skip-forward" size={22} onPress={p.next} color={p.queue.length > 1 ? colors.text : colors.faint} label="Next" />
      </View>
      <View style={s.track}>
        <View style={[s.fill, { width: `${Math.min(100, progress * 100)}%` }]} />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: {
    marginHorizontal: space(2), marginBottom: space(1.5), backgroundColor: colors.cardHi, borderRadius: radius.md,
    overflow: 'hidden', borderWidth: 1, borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(2) },
  track: { height: 2, backgroundColor: colors.border },
  fill: { height: 2, backgroundColor: colors.accent },
});
