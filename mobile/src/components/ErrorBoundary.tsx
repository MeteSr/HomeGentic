/**
 * Last-resort catch for render errors: a calm "something went wrong" screen
 * with a way to carry on, instead of a white screen (release builds) or a
 * crash. Errors are logged; a crash reporter can hook in at componentDidCatch.
 */
import React, { Component, ErrorInfo, ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { family, v3 } from "../theme";

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: v3.bg, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text accessibilityRole="header" style={{ fontFamily: family.display, fontSize: 26, letterSpacing: -0.6, color: v3.ink, textAlign: "center" }}>
          Something went wrong
        </Text>
        <Text style={{ fontFamily: family.body, fontSize: 14, lineHeight: 21, color: v3.muted, textAlign: "center", marginTop: 12, maxWidth: 360 }}>
          The app hit a problem showing this screen. Your records are safe. Try again, and if it keeps happening, close and reopen HomeGentic.
        </Text>
        <Pressable
          onPress={this.reset}
          accessibilityRole="button"
          style={{ marginTop: 24, minHeight: 48, paddingHorizontal: 28, borderRadius: 100, backgroundColor: v3.ink, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontFamily: family.bodySemi, fontSize: 15, color: v3.paper }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}
