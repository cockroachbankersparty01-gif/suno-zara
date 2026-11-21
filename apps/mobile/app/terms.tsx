import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ErrorBanner, GhostButton, GradientButton } from '../src/components/ui';
import { useSession } from '../src/session';
import { colors, radius, space, type } from '../src/theme';

// Plain-language summary. Have a lawyer review the full terms before a public launch.
const SECTIONS: [string, string][] = [
  ['Free to use', 'Suno Zara is free. There are no paid plans. To share our limited computing power fairly, everyone gets a free daily allowance of songs that refills every day.'],
  ['You own your songs', 'Songs you create belong to you. You can download them, share them, and use them, including commercially, as long as you follow these rules.'],
  ['Be original', "Don't try to copy real artists' voices, names or songs, and don't paste in lyrics you don't have the rights to. Prompts that name real artists are blocked."],
  ['Be respectful', 'No hate speech, harassment, sexual content involving minors, or content that encourages violence. Breaking these rules can get songs removed and accounts suspended.'],
  ['Public songs', "Songs you publish appear in Explore, where others can play, like, remix and extend them. Songs you don't publish stay private."],
  ['AI isn\'t perfect', 'Generated music and lyrics can be unexpected. Listen before you share, and report anything that seems wrong.'],
  ['Your data', 'We store your account, your songs and what you typed to make them, so you can find and recreate them. You can delete songs any time.'],
];

export default function Terms() {
  const { acceptTos, signOut, config, status } = useSession();
  const reviewing = status === 'ready'; // opened from Profile, already accepted
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={s.wrap}>
        <Text style={type.title}>Before you start</Text>
        <Text style={type.small}>Terms of Service · version {config?.tosVersion}</Text>
        {SECTIONS.map(([h, b]) => (
          <View key={h} style={s.card}>
            <Text style={type.h2}>{h}</Text>
            <Text style={[type.body, { color: colors.muted, lineHeight: 22 }]}>{b}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={s.footer}>
        {reviewing ? (
          <GradientButton title="Done" onPress={() => router.back()} />
        ) : (<>
        {err && <ErrorBanner message={err} />}
        <GradientButton
          title="I agree"
          icon="checkmark"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            setErr(null);
            try {
              await acceptTos();
              router.replace('/(tabs)');
            } catch (e: any) {
              setErr(e?.message ?? String(e));
            } finally {
              setBusy(false);
            }
          }}
        />
        <GhostButton title="Sign out" onPress={signOut} style={{ alignSelf: 'center' }} />
        </>)}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space(5), gap: space(3), paddingBottom: space(10) },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space(4), gap: space(1.5) },
  footer: { padding: space(5), gap: space(2), borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
});
