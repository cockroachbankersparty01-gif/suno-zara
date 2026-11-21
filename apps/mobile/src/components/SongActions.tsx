import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { friendlyError, type Song } from '../api';
import { useGenerations } from '../generations';
import { usePlayer } from '../player';
import { useApi, useSession } from '../session';
import { colors, radius, space, type } from '../theme';
import { Chip, Cover, Field, GhostButton, GradientButton, type IconName } from './ui';

const REMIX_STYLES = ['lo-fi', 'pop', 'edm', 'rock', 'acoustic', 'bollywood', 'hip-hop', 'jazz', 'r&b', 'ambient', 'orchestral', 'reggaeton'];

type Dialog = null | 'rename' | 'remix';

/**
 * Bottom-sheet with every song action. Owners get edit actions; everyone can
 * play, like, share, download, extend and remix (public songs).
 */
export function SongActions({ song, onClose, onChanged, onDeleted }: {
  song: Song | null; onClose(): void; onChanged?(s: Song): void; onDeleted?(id: string): void;
}) {
  const api = useApi();
  const { me } = useSession();
  const player = usePlayer();
  const gens = useGenerations();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [title, setTitle] = useState('');
  const [styles, setStyles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDialog(null);
    setTitle(song?.title ?? '');
    setStyles([]);
  }, [song?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!song) return null;
  const mine = song.author ? song.author.id === me?.profile.id : true;

  const changed = (s: Song) => {
    onChanged?.(s);
    player.patchSong(s);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Oops', friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const startGen = (fn: () => Promise<{ generation: any }>) =>
    run(async () => {
      const { generation } = await fn();
      gens.track(generation);
      onClose();
      router.push('/create');
    });

  type Action = { icon: IconName; label: string; onPress(): void; danger?: boolean; show?: boolean };
  const actions: Action[] = [
    { icon: 'play', label: 'Play', onPress: () => { player.play(song); onClose(); } },
    {
      icon: song.likedByMe ? 'heart' : 'heart-outline', label: song.likedByMe ? 'Unlike' : 'Like',
      onPress: () => run(async () => {
        const r = song.likedByMe ? await api.unlike(song.id) : await api.like(song.id);
        changed({ ...song, likedByMe: r.liked, likeCount: r.likeCount });
      }),
    },
    {
      icon: 'share-social-outline', label: 'Share',
      onPress: () => {
        if (!song.isPublic && mine) {
          Alert.alert('Song is private', 'Make it public so others can open the link?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Make public & share', onPress: () => run(async () => {
              const r = await api.updateSong(song.id, { isPublic: true });
              changed(r.song);
              await Share.share({ message: `🎵 ${r.song.title} — made with Suno Zara\n${r.song.audioUrl}` });
            }) },
          ]);
          return;
        }
        Share.share({ message: `🎵 ${song.title} — made with Suno Zara\n${song.audioUrl}` }).catch(() => {});
      },
    },
    { icon: 'download-outline', label: 'Download MP3', onPress: () => Linking.openURL(song.downloadUrl).catch(() => Alert.alert('Could not open download')) },
    { icon: 'create-outline', label: 'Rename', onPress: () => setDialog('rename'), show: mine },
    {
      icon: song.isPublic ? 'lock-closed-outline' : 'globe-outline', label: song.isPublic ? 'Make private' : 'Publish to Explore', show: mine,
      onPress: () => run(async () => changed((await api.updateSong(song.id, { isPublic: !song.isPublic })).song)),
    },
    { icon: 'add-circle-outline', label: 'Extend (+30 sec)', onPress: () => startGen(() => api.extend(song.id)) },
    { icon: 'shuffle', label: 'Remix in a new style', onPress: () => setDialog('remix') },
    { icon: 'image-outline', label: 'New cover art', show: mine, onPress: () => run(async () => changed((await api.newCover(song.id)).song)) },
    {
      icon: 'person-outline', label: `View ${song.author?.displayName ?? 'creator'}`, show: !mine && !!song.author,
      onPress: () => { onClose(); router.push(`/user/${song.author!.username}`); },
    },
    {
      icon: 'trash-outline', label: 'Delete', danger: true, show: mine,
      onPress: () => Alert.alert('Delete song?', `"${song.title}" will be gone for good.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => run(async () => {
          await api.deleteSong(song.id);
          if (player.current?.id === song.id) player.stop();
          onDeleted?.(song.id);
          gens.bumpLibrary();
          onClose();
        }) },
      ]),
    },
  ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={dialog ? () => setDialog(null) : onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.head}>
          <Cover uri={song.coverUrl} size={52} rounded={radius.sm} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={type.h2}>{song.title}</Text>
            <Text numberOfLines={1} style={type.small}>{song.styleTags.join(', ') || 'Song'}</Text>
          </View>
        </View>

        {dialog === 'rename' && (
          <View style={s.dialog}>
            <Field label="New title" value={title} onChangeText={setTitle} maxLength={100} autoFocus />
            <GradientButton title="Save" loading={busy} disabled={!title.trim()} onPress={() => run(async () => {
              changed((await api.updateSong(song.id, { title: title.trim() })).song);
              setDialog(null);
            })} />
          </View>
        )}

        {dialog === 'remix' && (
          <View style={s.dialog}>
            <Text style={type.small}>Pick up to 3 styles. Same song, new sound.</Text>
            <View style={s.chips}>
              {REMIX_STYLES.map((t) => (
                <Chip key={t} label={t} selected={styles.includes(t)} onPress={() =>
                  setStyles((p) => (p.includes(t) ? p.filter((x) => x !== t) : p.length < 3 ? [...p, t] : p))} />
              ))}
            </View>
            <GradientButton title="Remix" icon="shuffle" loading={busy} disabled={!styles.length} onPress={() => startGen(() => api.remix(song.id, styles))} />
          </View>
        )}

        {!dialog && (
          <ScrollView style={{ maxHeight: 420 }}>
            {actions.filter((a) => a.show !== false).map((a) => (
              <GhostButton key={a.label} icon={a.icon} title={a.label} danger={a.danger} onPress={a.onPress} />
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingHorizontal: space(3), paddingBottom: space(8), paddingTop: space(2),
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: space(3) },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(2), paddingBottom: space(3) },
  dialog: { gap: space(4), padding: space(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
});
