import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, IconName } from "../components/Icon";
import { family, v3 } from "../theme";

export interface TabSpec {
  label: string;
  icon:  IconName;
  /** Dot colour when the tab needs attention, or null. */
  dot?:  string | null;
}

/** Height of the bar above the safe-area inset — the assistant button sits 28pt above it. */
export const TAB_BAR_BODY = 8 + 44 + 8;

export function tabBarBottomPad(insetBottom: number): number {
  return Math.max(insetBottom - 8, 12);
}

/**
 * Floating assistant button, 28pt above the tab bar. Rendered over the tab
 * navigator (not inside the bar) so it stays tappable on Android.
 */
export function AskButton({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      style={[s.fab, { bottom: TAB_BAR_BODY + tabBarBottomPad(insets.bottom) + 28 }]}
      accessibilityRole="button"
      accessibilityLabel="Ask the assistant"
    >
      <Icon name="mic" size={22} color={v3.paper} />
    </Pressable>
  );
}

/** The v3 bottom bar: icon in a pill (yellow tint when active) over a small label. */
export function TabBar({ state, navigation, specs }: BottomTabBarProps & { specs: Record<string, TabSpec> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingBottom: tabBarBottomPad(insets.bottom) }]}>
      {state.routes.map((route, index) => {
        const spec = specs[route.name];
        const focused = state.index === index;
        const color = focused ? v3.ink : v3.muted;
        return (
          <Pressable
            key={route.key}
            style={s.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={spec.dot ? `${spec.label}, needs attention` : spec.label}
            onPress={() => {
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            }}
          >
            <View style={[s.pill, { backgroundColor: focused ? v3.yellowTint : "transparent" }]}>
              <Icon name={spec.icon} size={19} color={color} />
              {spec.dot ? <View style={[s.dot, { backgroundColor: spec.dot }]} /> : null}
            </View>
            <Text style={[s.label, { color }]}>{spec.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: v3.line,
    backgroundColor: v3.paper,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tab:   { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", gap: 6 },
  pill:  { paddingVertical: 4, paddingHorizontal: 14, borderRadius: 100, alignItems: "center", justifyContent: "center" },
  dot:   { position: "absolute", top: 0, right: 8, width: 7, height: 7, borderRadius: 100 },
  label: { fontFamily: family.bodySemi, fontSize: 9.5, lineHeight: 11 },
  fab: {
    position: "absolute",
    right: 18,
    width: 56,
    height: 56,
    borderRadius: 100,
    backgroundColor: v3.ink,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: v3.ink,
    shadowOpacity: 0.32,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
});
