import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useAuthContext } from "../auth/AuthContext";
import { colors, fonts, spacing } from "../theme";

export default function LoginScreen() {
  const { authState, login } = useAuthContext();
  const isLoading = authState.status === "loading";

  return (
    <View style={styles.container}>
      <Text style={styles.wordmark}>HOMEGENTIC</Text>
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
          <Text style={styles.buttonText}>SIGN IN WITH INTERNET IDENTITY</Text>
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
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  wordmark: {
    fontFamily: fonts.mono,
    fontSize: 13,
    letterSpacing: 4,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  tagline: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.ink,
    textAlign: "center",
    lineHeight: 34,
  },
  divider: {
    width: 40,
    height: 1,
    backgroundColor: colors.rust,
    marginVertical: spacing.xl,
  },
  button: {
    backgroundColor: colors.ink,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    width: "100%",
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.paper,
  },
  errorText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.rust,
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
