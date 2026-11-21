import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Song } from './api';
import { useSession } from './session';

interface PlayerValue {
  current: Song | null;
  queue: Song[];
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  play(song: Song, queue?: Song[]): void;
  toggle(): void;
  seek(seconds: number): void;
  next(): void;
  previous(): void;
  /** Update the song in place (e.g. after a like or rename) without interrupting playback. */
  patchSong(song: Partial<Song> & { id: string }): void;
  stop(): void;
}

const Ctx = createContext<PlayerValue | null>(null);
export const usePlayer = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlayer outside PlayerProvider');
  return v;
};

const PLAY_COUNT_AFTER_SEC = 10;

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { api } = useSession();
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [queue, setQueue] = useState<Song[]>([]);
  const [index, setIndex] = useState(-1);
  const counted = useRef<Set<string>>(new Set());
  const current = index >= 0 ? queue[index] ?? null : null;

  useEffect(() => {
    // Lock-screen controls on Android need doNotMix; background play keeps music going with the screen off.
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(() => {});
  }, []);

  const load = useCallback(
    (song: Song) => {
      player.replace({ uri: song.audioUrl });
      player.play();
      try {
        player.setActiveForLockScreen(true, {
          title: song.title,
          artist: song.author?.displayName ?? song.author?.username ?? 'Suno Zara',
          artworkUrl: song.coverUrl ?? undefined,
        }, { showNextTrack: true, showPreviousTrack: true });
      } catch {
        // Lock-screen controls are a nicety; never block playback on them.
      }
    },
    [player],
  );

  const play = useCallback(
    (song: Song, q?: Song[]) => {
      const list = q && q.some((s) => s.id === song.id) ? q : [song];
      setQueue(list);
      setIndex(list.findIndex((s) => s.id === song.id));
      load(song);
    },
    [load],
  );

  const jump = useCallback(
    (delta: number) => {
      if (!queue.length) return;
      const i = index + delta;
      if (i < 0 || i >= queue.length) return;
      setIndex(i);
      load(queue[i]);
    },
    [index, queue, load],
  );

  // Auto-advance at the end of a song.
  useEffect(() => {
    if (status.didJustFinish) {
      if (index < queue.length - 1) jump(1);
      else player.seekTo(0).catch(() => {});
    }
  }, [status.didJustFinish]); // eslint-disable-line react-hooks/exhaustive-deps

  // Count a play once the listener has heard ~10 seconds.
  useEffect(() => {
    if (!current || !api || counted.current.has(current.id)) return;
    if (status.playing && status.currentTime >= PLAY_COUNT_AFTER_SEC) {
      counted.current.add(current.id);
      api.play(current.id).catch(() => {});
    }
  }, [status.currentTime, status.playing, current, api]);

  const value: PlayerValue = {
    current,
    queue,
    playing: status.playing,
    buffering: status.isBuffering,
    position: status.currentTime ?? 0,
    duration: status.duration || current?.durationSec || 0,
    play,
    toggle() {
      if (!current) return;
      if (status.playing) player.pause();
      else {
        if (status.duration && status.currentTime >= status.duration - 0.25) player.seekTo(0).catch(() => {});
        player.play();
      }
    },
    seek(seconds) {
      player.seekTo(Math.max(0, seconds)).catch(() => {});
    },
    next: () => jump(1),
    previous() {
      // Like most players: restart the song if we're past 3s, otherwise go back.
      if (status.currentTime > 3 || index === 0) player.seekTo(0).catch(() => {});
      else jump(-1);
    },
    patchSong(patch) {
      setQueue((q) => q.map((s) => (s.id === patch.id ? { ...s, ...patch } : s)));
    },
    stop() {
      player.pause();
      try {
        player.clearLockScreenControls();
      } catch {}
      setQueue([]);
      setIndex(-1);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
