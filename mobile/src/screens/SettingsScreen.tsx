import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, fonts, spacing } from "../theme";

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>SETTINGS</Text>
      <Text style={styles.placeholder}>Account settings coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.inkLight,
    marginBottom: spacing.sm,
  },
  placeholder: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
  },
});
