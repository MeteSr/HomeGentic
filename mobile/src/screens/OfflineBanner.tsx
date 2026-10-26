import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { family } from "../theme";

interface Props {
  offline: boolean;
}

/**
 * Floats under the status bar while the device is offline. Taps pass through
 * to the screen beneath. Jobs logged while offline wait in the offline queue;
 * other changes need a connection, so the copy doesn't promise more.
 */
export default function OfflineBanner({ offline }: Props) {
  const insets = useSafeAreaInsets();
  if (!offline) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 6 }]}>
      <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Text style={styles.text}>You're offline. Jobs you log are saved on this phone and sent when you reconnect.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    alignItems: "center",
  },
  banner: {
    maxWidth: 560,
    backgroundColor: "#7A3410",
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  text: {
    fontFamily: family.bodySemi,
    fontSize: 12.5,
    lineHeight: 17,
    color: "#FFF6DB",
    textAlign: "center",
  },
});
