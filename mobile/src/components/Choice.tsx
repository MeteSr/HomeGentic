import React from "react";
import { Pressable, Text } from "react-native";
import { family, v3 } from "../theme";

/** One option in a row of radio pills. */
export function Choice({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 15, borderRadius: 100, borderWidth: 1.5, borderColor: on ? v3.ink : v3.chipLine, backgroundColor: on ? v3.ink : v3.surface }}
    >
      <Text style={{ fontFamily: family.bodySemi, fontSize: 12.5, color: on ? v3.paper : v3.ink }}>{label}</Text>
    </Pressable>
  );
}

export const inputStyle = {
  minHeight: 46, borderWidth: 1.5, borderColor: v3.chipLine, borderRadius: 12, backgroundColor: v3.surface,
  paddingVertical: 12, paddingHorizontal: 14, marginTop: 9, fontFamily: family.body, fontSize: 14, color: v3.ink,
} as const;
