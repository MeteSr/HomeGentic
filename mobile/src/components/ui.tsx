/**
 * v3 building blocks: cards, pill buttons, chips, list rows, page headers and
 * the bottom sheet. Sizes and colours come straight from the Mobile v3 design.
 */
import React, { ReactNode, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { family, radius, shadow, type, v3 } from "../theme";
import { Icon, IconName } from "./Icon";

// ── Text ─────────────────────────────────────────────────────────────────────

export function Kicker({ children, color, style }: { children: ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.kicker, color ? { color } : null, style]}>{children}</Text>;
}

/** Uppercase section label above a card ("RECURRING SERVICES"). */
export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={s.sectionLabel}>
      <Kicker>{children}</Kicker>
      {right}
    </View>
  );
}

/** Kicker + large title at the top of a tab. The title can open a picker. */
export function PageHeader({
  kicker,
  title,
  onTitlePress,
  children,
}: {
  kicker: string;
  title: string;
  onTitlePress?: () => void;
  children?: ReactNode;
}) {
  const titleNode = (
    <View style={s.titleRow}>
      <Text style={[type.pageTitle, { flexShrink: 1 }]}>{title}</Text>
      {onTitlePress && <Icon name="chevronDown" size={18} color={v3.muted} strokeWidth={2.4} />}
    </View>
  );
  return (
    <View style={s.pageHeader}>
      <Kicker>{kicker}</Kicker>
      {onTitlePress ? (
        <Pressable onPress={onTitlePress} accessibilityRole="button" accessibilityLabel={`${title}, switch property`}>
          {titleNode}
        </Pressable>
      ) : titleNode}
      {children}
    </View>
  );
}

// ── Containers ───────────────────────────────────────────────────────────────

export function Card({
  children,
  style,
  onPress,
  flat,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** No drop shadow (secondary cards in the design). */
  flat?: boolean;
  accessibilityLabel?: string;
}) {
  const st = [s.card, !flat && shadow, style];
  if (!onPress) return <View style={st}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={st} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {children}
    </Pressable>
  );
}

/** Yellow callout ("PART OF PRO", "SCORE AT RISK", pending approvals). */
export function Callout({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.callout, style]}>{children}</View>;
}

/** A row inside a list card, divided from the next by a hairline. */
export function Row({
  children,
  onPress,
  style,
  last,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  last?: boolean;
  accessibilityLabel?: string;
}) {
  const st = [s.row, last && { borderBottomWidth: 0 }, style];
  if (!onPress) return <View style={st}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={st} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {children}
    </Pressable>
  );
}

/** Blue "+ Add …" row at the foot of a list card. */
export function AddRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.addRow} accessibilityRole="button" accessibilityLabel={label}>
      <Icon name="plus" size={16} color={v3.blue} strokeWidth={2.4} />
      <Text style={s.addRowText}>{label}</Text>
    </Pressable>
  );
}

/** Square icon tile with a 2-letter code ("GU", "HV"). */
export function IconTile({
  abbr,
  bg = v3.lineSoft,
  color = v3.muted,
  size = 34,
  round,
}: {
  abbr: string;
  bg?: string;
  color?: string;
  size?: number;
  round?: boolean;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: round ? 100 : size === 30 ? 10 : 11,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontFamily: round ? family.displayBold : family.monoBold, fontSize: round ? 11 : 10, color }}>{abbr}</Text>
    </View>
  );
}

// ── Buttons and chips ────────────────────────────────────────────────────────

type PillVariant = "primary" | "ink" | "paper" | "outline" | "outlineOnDark" | "tint" | "danger" | "done";

const PILL: Record<PillVariant, { bg: string; border: string; color: string }> = {
  primary:       { bg: v3.blue,       border: v3.blue,                 color: v3.paper },
  ink:           { bg: v3.ink,        border: v3.ink,                  color: v3.paper },
  paper:         { bg: v3.paper,      border: v3.paper,                color: v3.ink },
  outline:       { bg: "transparent", border: v3.chipLine,             color: v3.ink },
  outlineOnDark: { bg: "transparent", border: "rgba(252,252,253,0.45)", color: v3.paper },
  tint:          { bg: v3.blueTint,   border: v3.blueLine,             color: v3.blue },
  danger:        { bg: "transparent", border: v3.redLine,              color: v3.red },
  done:          { bg: v3.surface,    border: v3.chipLine,             color: v3.muted },
};

export function Pill({
  label,
  onPress,
  variant = "primary",
  small,
  block,
  disabled,
  loading,
  icon,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  variant?: PillVariant;
  /** 40pt high, used inside inset panels. Default is 44pt. */
  small?: boolean;
  /** Full width, centred label. */
  block?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const c = PILL[variant];
  const thin = variant === "tint";
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        s.pill,
        {
          minHeight: small ? 40 : 44,
          paddingHorizontal: small ? 16 : 20,
          backgroundColor: c.bg,
          borderColor: c.border,
          borderWidth: thin ? 1 : 1.5,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          alignSelf: block ? "stretch" : "flex-start",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={c.color} />
      ) : (
        <>
          <Text style={[type.button, { fontSize: small ? 12.5 : 13, color: c.color }]}>{label}</Text>
          {icon && <Icon name={icon} size={15} color={c.color} strokeWidth={2.4} />}
        </>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  color = v3.muted,
  bg = "transparent",
  border,
  style,
}: {
  label: string;
  color?: string;
  bg?: string;
  /** Outline colour; omit for a filled chip. */
  border?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        s.chip,
        { backgroundColor: bg, borderColor: border ?? "transparent", borderWidth: border ? 1 : 0 },
        style,
      ]}
    >
      <Text style={[type.chip, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export const chipTone = {
  blue:   { color: v3.blue,  bg: v3.blueTint },
  red:    { color: v3.red,   bg: v3.redTint },
  muted:  { color: v3.muted, bg: v3.lineSoft },
  yellow: { color: v3.ink,   bg: v3.yellowTint, border: v3.yellow },
} as const;

/** Round 34pt outlined close button used in sheets. */
export function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
      <Icon name="close" size={14} color={v3.muted} strokeWidth={2.6} />
    </Pressable>
  );
}

/** Grey "← Account" link at the top of pushed screens. */
export function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.backLink} accessibilityRole="button" accessibilityLabel={label === "Back" ? "Back" : `Back to ${label}`}>
      <Icon name="back" size={16} color={v3.muted} strokeWidth={2.4} />
      <Text style={[type.button, { color: v3.muted }]}>{label}</Text>
    </Pressable>
  );
}

// ── Screens ──────────────────────────────────────────────────────────────────

/** Scrolling tab body. Leaves room at the bottom for the assistant button. */
export function TabScroll({
  children,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: v3.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: 96 }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={v3.muted} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

/**
 * Full-screen pushed page (People, Upgrade, Compare bids): back link on top,
 * no tab bar, optional pinned footer (the upgrade button).
 */
export function PushedScroll({
  backLabel,
  onBack,
  children,
  footer,
  refreshing,
  onRefresh,
}: {
  backLabel: string;
  onBack: () => void;
  children: ReactNode;
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: v3.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: footer ? 12 : insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={v3.muted} /> : undefined}
      >
        <BackLink label={backLabel} onPress={onBack} />
        {children}
      </ScrollView>
      {footer && (
        <View style={{ borderTopWidth: 1, borderTopColor: v3.line, backgroundColor: v3.paper, paddingTop: 14, paddingHorizontal: 18, paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
          {footer}
        </View>
      )}
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ paddingVertical: 28, alignItems: "center" }}>
      <ActivityIndicator color={v3.muted} />
    </View>
  );
}

/** Muted one-liner inside a card when a list is empty or failed to load. */
export function EmptyRow({ text }: { text: string }) {
  return (
    <View style={[s.row, { borderBottomWidth: 0 }]}>
      <Text style={type.body}>{text}</Text>
    </View>
  );
}

// ── Bottom sheet ─────────────────────────────────────────────────────────────

export function Sheet({
  visible,
  onClose,
  children,
  maxHeight = "82%",
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  maxHeight?: `${number}%`;
}) {
  const insets = useSafeAreaInsets();
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    rise.setValue(0);
    Animated.timing(rise, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [visible, rise]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <Animated.View
          style={[
            s.sheet,
            { maxHeight, paddingBottom: Math.max(30, insets.bottom + 12) },
            {
              opacity: rise,
              transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
            },
          ]}
        >
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sectionLabel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 22,
    marginBottom: 11,
    marginHorizontal: 2,
  },
  pageHeader: { paddingTop: 10, paddingBottom: 16, paddingHorizontal: 2 },
  titleRow:   { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 9 },
  card: {
    backgroundColor: v3.surface,
    borderWidth: 1,
    borderColor: v3.line,
    borderRadius: radius.card,
    overflow: "hidden",
  },
  callout: {
    backgroundColor: v3.yellowTint,
    borderWidth: 1,
    borderColor: v3.yellow,
    borderRadius: radius.card,
    padding: 20,
  },
  row: {
    minHeight: 44,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: v3.lineSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  addRow: {
    minHeight: 44,
    paddingVertical: 15,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  addRowText: { fontFamily: family.bodySemi, fontSize: 13.5, color: v3.blue },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: radius.pill,
    paddingVertical: 10,
  },
  chip: {
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 9,
    alignSelf: "flex-start",
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: v3.chipLine,
    alignItems: "center",
    justifyContent: "center",
  },
  backLink: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start" },
  scrim: { flex: 1, backgroundColor: v3.scrim, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: v3.paper,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: 20,
    paddingHorizontal: 18,
  },
});
