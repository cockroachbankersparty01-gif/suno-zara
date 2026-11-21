import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Generation, Song } from './api';
import { useSession } from './session';

/**
 * Tracks songs being made, app-wide: the Create screen, the Library banner and the
 * tab badge all read from here. Polls every 2s while anything is in progress.
 */
interface GenerationsValue {
  active: Generation[];
  /** Results of generations that finished while the app was open (newest first). */
  recent: { generation: Generation; songs: Song[] }[];
  /** Bumped whenever new songs land, so lists know to refresh. */
  libraryVersion: number;
  track(g: Generation): void;
  dismiss(generationId: string): void;
  bumpLibrary(): void;
}

const Ctx = createContext<GenerationsValue | null>(null);
export const useGenerations = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGenerations outside GenerationsProvider');
  return v;
};

export function GenerationsProvider({ children }: { children: React.ReactNode }) {
  const { api, status, refreshMe } = useSession();
  const [active, setActive] = useState<Generation[]>([]);
  const [recent, setRecent] = useState<GenerationsValue['recent']>([]);
  const [libraryVersion, setLibraryVersion] = useState(0);
  const polling = useRef(false);

  // Pick up anything already in progress (e.g. started before the app was closed).
  useEffect(() => {
    if (status !== 'ready' || !api) return;
    api.activeGenerations().then((r) => setActive(r.generations)).catch(() => {});
  }, [status, api]);

  const poll = useCallback(async () => {
    if (!api || polling.current) return;
    polling.current = true;
    try {
      const ids = active.map((g) => g.id);
      const results = await Promise.all(ids.map((id) => api.generation(id).catch(() => null)));
      const stillActive: Generation[] = [];
      const finished: GenerationsValue['recent'] = [];
      for (const r of results) {
        if (!r) continue;
        if (r.generation.status === 'queued' || r.generation.status === 'processing') stillActive.push(r.generation);
        else finished.push(r);
      }
      setActive(stillActive);
      if (finished.length) {
        setRecent((prev) => [...finished, ...prev].slice(0, 10));
        setLibraryVersion((v) => v + 1);
        void refreshMe(); // credits changed
      }
    } finally {
      polling.current = false;
    }
  }, [api, active, refreshMe]);

  useEffect(() => {
    if (!active.length) return;
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, [active.length, poll]);

  const value: GenerationsValue = {
    active,
    recent,
    libraryVersion,
    track: (g) => setActive((prev) => [g, ...prev.filter((x) => x.id !== g.id)]),
    dismiss: (id) => setRecent((prev) => prev.filter((r) => r.generation.id !== id)),
    bumpLibrary: () => setLibraryVersion((v) => v + 1),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
