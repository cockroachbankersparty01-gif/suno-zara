export const colors = {
  bg: '#0B0B12',
  surface: '#14141F',
  card: '#1C1C2B',
  cardHi: '#26263A',
  border: '#2C2C42',
  text: '#F5F5FA',
  muted: '#9A9AB5',
  faint: '#5F5F7A',
  accent: '#FF3CAC',
  accent2: '#784BA0',
  accent3: '#2B86C5',
  success: '#3DDC97',
  danger: '#FF5470',
  warning: '#FFB547',
};

/** The signature gradient used for primary buttons, progress and highlights. */
export const gradient = [colors.accent, colors.accent2, colors.accent3] as const;

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };
export const space = (n: number) => n * 4;

export const type = {
  hero: { fontSize: 30, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '800' as const, color: colors.text },
  h2: { fontSize: 17, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.muted },
  tiny: { fontSize: 11, color: colors.faint },
};

export const fmtTime = (sec: number) => {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const fmtCount = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
