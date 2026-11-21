import React, { useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { colors } from '../theme';

/** Bar waveform; the played part is highlighted. Tap or drag to seek. */
export function Waveform({ peaks, progress, onSeek, height = 56, bars = 60 }: {
  peaks: number[]; progress: number; onSeek?(fraction: number): void; height?: number; bars?: number;
}) {
  const [width, setWidth] = useState(0);
  const data = resample(peaks.length ? peaks : Array(bars).fill(0.35), bars);
  const seek = (e: GestureResponderEvent) => {
    if (!onSeek || !width) return;
    onSeek(Math.max(0, Math.min(1, e.nativeEvent.locationX / width)));
  };
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => !!onSeek}
      onMoveShouldSetResponder={() => !!onSeek}
      onResponderGrant={seek}
      onResponderMove={seek}
      style={{ height, flexDirection: 'row', alignItems: 'center', gap: 2 }}
    >
      {data.map((p, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(3, p * height),
            borderRadius: 2,
            backgroundColor: i / data.length <= progress ? colors.accent : colors.cardHi,
          }}
        />
      ))}
    </View>
  );
}

function resample(src: number[], n: number): number[] {
  if (src.length === n) return src;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * src.length) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * src.length) / n));
    let m = 0;
    for (let j = a; j < b && j < src.length; j++) m = Math.max(m, src[j]);
    out.push(m);
  }
  return out;
}
