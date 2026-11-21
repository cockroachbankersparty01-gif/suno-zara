import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MiniPlayer } from '../../src/components/MiniPlayer';
import { friendlyError, type Generation, type Song } from '../../src/api';
import { SongActions } from '../../src/components/SongActions';
import { Chip, Cover, ErrorBanner, Field, GradientBar, GradientButton, IconButton, Segmented, Toggle } from '../../src/components/ui';
import { useGenerations } from '../../src/generations';
import { usePlayer } from '../../src/player';
import { useApi, useSession } from '../../src/session';
import { colors, fmtTime, radius, space, type } from '../../src/theme';

const IDEAS = [
  'Upbeat lo-fi song about monsoon evenings in Mumbai',
  'Romantic Hindi ballad about a train journey',
  'Energetic EDM anthem for a college fest',
  'Soft acoustic lullaby about stars',
  'Punjabi bhangra party song about weekend plans',
  'Sad indie song about leaving home',
];
const STYLES = ['pop', 'lo-fi', 'bollywood', 'edm', 'hip-hop', 'rock', 'acoustic', 'r&b', 'jazz', 'ambient', 'indie', 'bhangra',
  'female vocals', 'male vocals', 'upbeat', 'chill', 'sad', 'romantic', 'energetic', 'dreamy'];

export default function Create() {
  const api = useApi();
  const { me, refreshMe } = useSession();
  const gens = useGenerations();
  const [mode, setMode] = useState<'simple' | 'custom'>('simple');
  const [prompt, setPrompt] = useState('');
  const [instrumental, setInstrumental] = useState(false);
  const [title, setTitle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState<'gen' | 'lyrics' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Song | null>(null);

  const credits = me?.credits;
  const canAfford = !credits || credits.unlimited || credits.available >= credits.perGeneration;

  const addTag = (t: string) => {
    const v = t.trim().toLowerCase();
    if (v && !tags.includes(v) && tags.length < 12) setTags([...tags, v]);
    setTagInput('');
  };

  const valid = mode === 'simple' ? prompt.trim().length >= 3 : instrumental || !!lyrics.trim() || tags.length > 0 || !!prompt.trim();

  const generate = async () => {
    setBusy('gen');
    setErr(null);
    try {
      const { generation } =
        mode === 'simple'
          ? await api.createSimple(prompt.trim(), instrumental)
          : await api.createCustom({
              title: title.trim() || undefined,
              lyrics: instrumental ? undefined : lyrics.trim() || undefined,
              styleTags: tags,
              prompt: prompt.trim() || undefined,
              instrumental,
            });
      gens.track(generation);
      void refreshMe();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const writeLyrics = async () => {
    if (prompt.trim().length < 3) {
      setErr('First describe what the song is about, then tap "Write with AI".');
      return;
    }
    setBusy('lyrics');
    setErr(null);
    try {
      const r = await api.writeLyrics(prompt.trim(), tags);
      setLyrics(r.lyrics);
      if (!title.trim()) setTitle(r.title);
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
          <View style={s.top}>
            <Text style={type.hero}>Create</Text>
            {credits && (
              <View style={s.credits}>
                <Ionicons name="flash" size={14} color={colors.warning} />
                <Text style={[type.small, { color: colors.text, fontWeight: '700' }]}>
                  {credits.unlimited ? 'Unlimited' : `${Math.floor(credits.available / credits.perGeneration)} free today`}
                </Text>
              </View>
            )}
          </View>

          <Segmented options={[{ value: 'simple', label: 'Simple' }, { value: 'custom', label: 'Custom' }]} value={mode} onChange={setMode} />

          {mode === 'simple' ? (
            <View style={s.card}>
              <Field
                label="Describe your song"
                placeholder="e.g. a happy Hinglish pop song about chai with friends"
                value={prompt}
                onChangeText={setPrompt}
                multiline
                maxLength={500}
                hint={`${prompt.length}/500 · We'll write the lyrics, pick a style and make 2 versions.`}
              />
              <Text style={s.label}>NEED AN IDEA?</Text>
              <View style={s.chips}>
                {IDEAS.map((i) => <Chip key={i} label={i} onPress={() => setPrompt(i)} />)}
              </View>
              <Toggle label="Instrumental (no vocals)" value={instrumental} onChange={setInstrumental} />
            </View>
          ) : (
            <View style={s.card}>
              <Field label="Title" placeholder="Leave empty and we'll name it" value={title} onChangeText={setTitle} maxLength={100} />
              <Toggle label="Instrumental (no vocals)" value={instrumental} onChange={setInstrumental} />
              {!instrumental && (
                <>
                  <Field
                    label="What's it about?"
                    placeholder="Used for AI lyrics, e.g. missing my hometown during Diwali"
                    value={prompt}
                    onChangeText={setPrompt}
                    maxLength={500}
                  />
                  <View style={s.rowBetween}>
                    <Text style={s.label}>LYRICS</Text>
                    <Pressable onPress={writeLyrics} disabled={busy !== null} style={s.aiBtn}>
                      <Ionicons name="sparkles" size={14} color={colors.accent} />
                      <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 13 }}>
                        {busy === 'lyrics' ? 'Writing…' : 'Write with AI'}
                      </Text>
                    </Pressable>
                  </View>
                  <Field
                    placeholder={'[Verse]\nYour words here…\n\n[Chorus]\n…'}
                    value={lyrics}
                    onChangeText={setLyrics}
                    multiline
                    maxLength={5000}
                    style={{ minHeight: 180 }}
                    hint="Use [Verse], [Chorus], [Bridge] to shape the song."
                  />
                </>
              )}
              <Text style={s.label}>STYLE</Text>
              {tags.length > 0 && (
                <View style={s.chips}>
                  {tags.map((t) => <Chip key={t} label={t} selected onRemove={() => setTags(tags.filter((x) => x !== t))} />)}
                </View>
              )}
              <Field
                placeholder="Type a style and press enter (e.g. 90s bollywood, sitar)"
                value={tagInput}
                onChangeText={setTagInput}
                onSubmitEditing={() => addTag(tagInput)}
                blurOnSubmit={false}
                returnKeyType="done"
                maxLength={40}
              />
              <View style={s.chips}>
                {STYLES.filter((t) => !tags.includes(t)).map((t) => <Chip key={t} label={`+ ${t}`} onPress={() => addTag(t)} />)}
              </View>
            </View>
          )}

          {err && <ErrorBanner message={err} />}
          {!canAfford && <ErrorBanner message="You've used today's free songs. Your credits refill tomorrow!" />}

          <GradientButton
            title={busy === 'gen' ? 'Starting…' : 'Create 2 songs'}
            icon="musical-notes"
            loading={busy === 'gen'}
            disabled={!valid || !canAfford || busy !== null}
            onPress={generate}
          />

          {gens.active.length > 0 && <Text style={type.h2}>In progress</Text>}
          {gens.active.map((g) => <ProgressCard key={g.id} g={g} />)}

          {gens.recent.length > 0 && <Text style={type.h2}>Just made</Text>}
          {gens.recent.map((r) => (
            <ResultCard key={r.generation.id} generation={r.generation} songs={r.songs} onMore={setSelected} onDismiss={() => gens.dismiss(r.generation.id)} />
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
      <SongActions song={selected} onClose={() => setSelected(null)} onChanged={setSelected} />
      <MiniPlayer />
    </SafeAreaView>
  );
}

function ProgressCard({ g }: { g: Generation }) {
  const waiting = g.status === 'queued';
  return (
    <View style={s.card}>
      <View style={s.rowBetween}>
        <Text numberOfLines={1} style={[type.body, { fontWeight: '700', flex: 1 }]}>
          {g.input.title || g.input.prompt || (g.type === 'extend' ? 'Extending song' : g.type === 'remix' ? 'Remixing song' : 'New song')}
        </Text>
        <Text style={[type.small, { color: colors.accent, fontWeight: '800' }]}>{waiting ? '' : `${g.progress}%`}</Text>
      </View>
      <GradientBar progress={waiting ? 2 : g.progress} />
      <Text style={type.small}>
        {waiting
          ? g.queuePosition
            ? `Waiting in line — ${g.queuePosition} song${g.queuePosition === 1 ? '' : 's'} ahead of you`
            : g.statusText ?? 'Waiting in queue…'
          : g.statusText ?? 'Composing…'}
      </Text>
    </View>
  );
}

function ResultCard({ generation, songs, onMore, onDismiss }: {
  generation: Generation; songs: Song[]; onMore(s: Song): void; onDismiss(): void;
}) {
  const player = usePlayer();
  if (generation.status === 'failed') {
    return (
      <View style={[s.card, { flexDirection: 'row', alignItems: 'center' }]}>
        <Ionicons name="alert-circle" size={20} color={colors.danger} />
        <Text style={[type.small, { flex: 1, color: colors.text }]}>{generation.error ?? 'That one failed — no credits were used. Try again?'}</Text>
        <IconButton icon="close" onPress={onDismiss} color={colors.muted} />
      </View>
    );
  }
  return (
    <View style={s.card}>
      <View style={s.rowBetween}>
        <Text style={[type.small, { color: colors.success, fontWeight: '800' }]}>✓ READY</Text>
        <IconButton icon="close" onPress={onDismiss} color={colors.muted} size={18} label="Dismiss" />
      </View>
      {songs.map((song, i) => {
        const on = player.current?.id === song.id;
        return (
          <Pressable key={song.id} onPress={() => (on ? player.toggle() : player.play(song, songs))} onLongPress={() => onMore(song)} style={s.result}>
            <Cover uri={song.coverUrl} size={64} rounded={radius.sm}>
              <View style={s.playOverlay}>
                <Ionicons name={on && player.playing ? 'pause' : 'play'} size={24} color="#fff" />
              </View>
            </Cover>
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={[type.h2, on && { color: colors.accent }]}>{song.title}</Text>
              <Text style={type.small}>Version {i + 1} · {fmtTime(song.durationSec)}</Text>
              <Text numberOfLines={1} style={type.tiny}>{song.styleTags.slice(0, 4).join(', ')}</Text>
            </View>
            <IconButton icon="ellipsis-vertical" onPress={() => onMore(song)} color={colors.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space(4), gap: space(4), paddingBottom: space(10) },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space(3) },
  credits: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.card, paddingHorizontal: space(3), paddingVertical: space(1.5), borderRadius: radius.pill },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space(4), gap: space(3) },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700', letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(2) },
  aiBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space(3), paddingVertical: space(1.5), borderRadius: radius.pill, backgroundColor: 'rgba(255,60,172,0.12)' },
  result: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
});
