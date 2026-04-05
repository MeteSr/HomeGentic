import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { buildReportUrl } from "../services/reportService";
import { colors, fonts, spacing, borderWidth } from "../theme";

export default function ReportScreen() {
  const [token, setToken]     = useState("");
  const [loading, setLoading] = useState(false);

  async function openReport() {
    const t = token.trim();
    if (!t) return;
    setLoading(true);
    try {
      await WebBrowser.openBrowserAsync(buildReportUrl(t), {
        toolbarColor: colors.paper,
        controlsColor: colors.rust,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>VIEW REPORT</Text>
      <Text style={styles.hint}>
        Enter a report token or paste a full share link to open the HomeGentic report.
      </Text>

      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={token}
          onChangeText={setToken}
          placeholder="Report token or URL"
          placeholderTextColor={colors.inkLight}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={openReport}
          accessibilityLabel="Report token input"
        />
        <TouchableOpacity
          style={[styles.btn, (!token.trim() || loading) && styles.btnDisabled]}
          onPress={openReport}
          disabled={!token.trim() || loading}
          accessibilityRole="button"
          accessibilityLabel="Open report"
        >
          {loading
            ? <ActivityIndicator color={colors.paper} size="small" />
            : <Text style={styles.btnText}>OPEN</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.inkLight,
    marginBottom: spacing.sm,
  },
  hint: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.inkLight,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  row: { flexDirection: "row", alignItems: "center" },
  input: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.ink,
    borderWidth: borderWidth,
    borderColor: colors.rule,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 44,
    marginRight: spacing.sm,
  },
  btn: {
    height: 44,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.rust,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { backgroundColor: colors.rule },
  btnText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.paper,
  },
});
