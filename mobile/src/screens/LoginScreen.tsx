import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useAuthContext } from "../auth/AuthContext";
import { colors, family, fonts, spacing, v3 } from "../theme";

export default function LoginScreen() {
  const { authState, login } = useAuthContext();
  const isLoading = authState.status === "loading";

  return (
    <View style={styles.container}>
      <Text style={styles.wordmark}>HomeGentic</Text>
      <Text style={styles.tagline}>Your home's permanent record.</Text>

      <View style={styles.divider} />

      <TouchableOpacity
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={login}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel="Sign in with Internet Identity"
      >
        {isLoading ? (
          <ActivityIndicator color={colors.paper} size="small" />
        ) : (
          <Text style={styles.buttonText}>Sign in with Internet Identity</Text>
        )}
      </TouchableOpacity>

      {authState.status === "error" && (
        <Text style={styles.errorText}>{authState.message}</Text>
      )}

      <Text style={styles.hint}>
        Internet Identity is a secure, password-free login backed by the
        Internet Computer blockchain.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: v3.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  wordmark: {
    fontFamily: family.displayBold,
    fontSize: 17,
    letterSpacing: -0.34,
    color: v3.blue,
    marginBottom: spacing.sm,
  },
  tagline: {
    fontFamily: family.display,
    fontSize: 30,
    letterSpacing: -0.9,
    color: v3.ink,
    textAlign: "center",
    lineHeight: 34,
  },
  divider: {
    width: 40,
    height: 4,
    borderRadius: 100,
    backgroundColor: v3.yellow,
    marginVertical: spacing.xl,
  },
  button: {
    backgroundColor: v3.ink,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    width: "100%",
    alignItems: "center",
    minHeight: 52,
    borderRadius: 100,
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: family.bodySemi,
    fontSize: 15,
    color: v3.paper,
  },
  errorText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: v3.red,
    marginTop: spacing.md,
    textAlign: "center",
  },
  hint: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.inkLight,
    textAlign: "center",
    lineHeight: 18,
    marginTop: spacing.xl,
  },
});
