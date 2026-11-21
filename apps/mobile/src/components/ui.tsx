import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { colors, gradient, radius, space, type } from '../theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function GradientButton({
  title, onPress, icon, loading, disabled, style, small,
}: {
  title: string; onPress(): void; icon?: IconName; loading?: boolean; disabled?: boolean;
  style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const off = disabled || loading;
  return (
    <Pressable onPress={onPress} disabled={off} style={({ pressed }) => [{ opacity: off ? 0.5 : pressed ? 0.85 : 1 }, style]}>
      <LinearGradient
        colors={gradient as unknown as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.gBtn, small && { paddingVertical: space(2.5), paddingHorizontal: space(4) }]}
      >
        {loading ? <ActivityIndicator color="#fff" /> : icon ? <Ionicons name={icon} size={small ? 16 : 20} color="#fff" /> : null}
        <Text style={[s.gBtnText, small && { fontSize: 14 }]}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function GhostButton({ title, onPress, icon, danger, style }: {
  title: string; onPress(): void; icon?: IconName; danger?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const c = danger ? colors.danger : colors.text;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.ghost, pressed && { backgroundColor: colors.cardHi }, style]}>
      {icon && <Ionicons name={icon} size={18} color={c} />}
      <Text style={[s.ghostText, { color: c }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, size = 22, color = colors.text, style, label }: {
  icon: IconName; onPress(): void; size?: number; color?: string; style?: StyleProp<ViewStyle>; label?: string;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityLabel={label} style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }, style]}>
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, onRemove }: {
  label: string; selected?: boolean; onPress?(): void; onRemove?(): void;
}) {
  const inner = (
    <View style={s.chipRow}>
      <Text style={[s.chipText, selected && { color: '#fff' }]}>{label}</Text>
      {onRemove && <Ionicons name="close" size={14} color={selected ? '#fff' : colors.muted} />}
    </View>
  );
  return (
    <Pressable onPress={onRemove ?? onPress} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
      {selected ? (
        <LinearGradient colors={gradient as unknown as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.chip}>
          {inner}
        </LinearGradient>
      ) : (
        <View style={[s.chip, s.chipOff]}>{inner}</View>
      )}
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: {
  // T is inferred from `value` only, so `onChange={setTab}` keeps the narrow union type.
  options: { value: NoInfer<T>; label: string }[]; value: T; onChange(v: NoInfer<T>): void;
}) {
  return (
    <View style={s.seg}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segItem, on && s.segOn]}>
            <Text style={[s.segText, on && { color: colors.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, hint, style, ...props }: TextInputProps & { label?: string; hint?: string }) {
  return (
    <View style={{ gap: space(1.5) }}>
      {label && <Text style={s.label}>{label}</Text>}
      <TextInput placeholderTextColor={colors.faint} selectionColor={colors.accent} {...props} style={[s.input, props.multiline && { minHeight: 110, textAlignVertical: 'top' }, style]} />
      {hint && <Text style={type.tiny}>{hint}</Text>}
    </View>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange(v: boolean): void }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={s.toggleRow}>
      <Text style={type.body}>{label}</Text>
      <View style={[s.track, value && { backgroundColor: colors.accent }]}>
        <View style={[s.knob, value && { transform: [{ translateX: 18 }] }]} />
      </View>
    </Pressable>
  );
}

/** Square cover art, with a gradient placeholder when there's no image yet. */
export function Cover({ uri, size, rounded = radius.md, children }: { uri?: string | null; size: number; rounded?: number; children?: React.ReactNode }) {
  return (
    <View style={{ width: size, height: size, borderRadius: rounded, overflow: 'hidden', backgroundColor: colors.card }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} />
      ) : (
        <LinearGradient colors={[colors.accent2, colors.bg]} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="musical-notes" size={size * 0.35} color="rgba(255,255,255,0.6)" />
        </LinearGradient>
      )}
      {children}
    </View>
  );
}

export function GradientBar({ progress }: { progress: number }) {
  return (
    <View style={s.barTrack}>
      <LinearGradient
        colors={gradient as unknown as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ width: `${Math.max(3, Math.min(100, progress))}%`, height: '100%', borderRadius: radius.pill }}
      />
    </View>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={44} color={colors.faint} />
      <Text style={type.h2}>{title}</Text>
      {body && <Text style={[type.small, { textAlign: 'center' }]}>{body}</Text>}
      {action}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?(): void }) {
  return (
    <View style={s.err}>
      <Ionicons name="alert-circle" size={18} color={colors.danger} />
      <Text style={[type.small, { color: colors.text, flex: 1 }]}>{message}</Text>
      {onRetry && <Text onPress={onRetry} style={{ color: colors.accent, fontWeight: '700' }}>Retry</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  gBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2),
    paddingVertical: space(4), paddingHorizontal: space(6), borderRadius: radius.pill,
  },
  gBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  ghost: {
    flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3.5), paddingHorizontal: space(4),
    borderRadius: radius.md,
  },
  ghostText: { fontSize: 15, fontWeight: '600' },
  iconBtn: { padding: space(1.5), alignItems: 'center', justifyContent: 'center' },
  chip: { paddingVertical: space(2), paddingHorizontal: space(3.5), borderRadius: radius.pill },
  chipOff: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  seg: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.pill, padding: 4 },
  segItem: { flex: 1, paddingVertical: space(2.5), borderRadius: radius.pill, alignItems: 'center' },
  segOn: { backgroundColor: colors.cardHi },
  segText: { color: colors.muted, fontWeight: '700', fontSize: 14 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  input: {
    backgroundColor: colors.card, color: colors.text, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: space(4), paddingVertical: space(3.5), fontSize: 16,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space(2) },
  track: { width: 46, height: 28, borderRadius: 14, backgroundColor: colors.cardHi, padding: 3 },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  barTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.cardHi, overflow: 'hidden' },
  empty: { alignItems: 'center', gap: space(2), paddingVertical: space(16), paddingHorizontal: space(8) },
  err: {
    flexDirection: 'row', alignItems: 'center', gap: space(2), backgroundColor: 'rgba(255,84,112,0.12)',
    borderRadius: radius.md, padding: space(3), borderWidth: 1, borderColor: 'rgba(255,84,112,0.35)',
  },
});
