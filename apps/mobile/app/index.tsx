import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { colors } from '../src/theme';

/** Shown for a moment while the saved session loads; the Gate then redirects. */
export default function Boot() {
  return (
    <LinearGradient colors={[colors.accent2, colors.bg]} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <Text style={{ color: colors.text, fontSize: 34, fontWeight: '900', letterSpacing: -1 }}>Suno Zara</Text>
      <ActivityIndicator color={colors.text} />
    </LinearGradient>
  );
}
