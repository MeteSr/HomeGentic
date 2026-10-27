import React from "react";
import { Linking, View, StyleSheet } from "react-native";
import * as Notifications from "expo-notifications";
import * as WebBrowser from "expo-web-browser";
import { NavigationContainer, DefaultTheme, type LinkingOptions } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
// Per-weight imports so only these eight font files are bundled.
import { BricolageGrotesque_700Bold }      from "@expo-google-fonts/bricolage-grotesque/700Bold";
import { BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque/800ExtraBold";
import { HankenGrotesk_400Regular }        from "@expo-google-fonts/hanken-grotesk/400Regular";
import { HankenGrotesk_500Medium }         from "@expo-google-fonts/hanken-grotesk/500Medium";
import { HankenGrotesk_600SemiBold }       from "@expo-google-fonts/hanken-grotesk/600SemiBold";
import { JetBrainsMono_400Regular }        from "@expo-google-fonts/jetbrains-mono/400Regular";
import { JetBrainsMono_500Medium }         from "@expo-google-fonts/jetbrains-mono/500Medium";
import { JetBrainsMono_700Bold }           from "@expo-google-fonts/jetbrains-mono/700Bold";
import { AuthProvider, useAuthContext } from "./src/auth/AuthContext";
import { AppDataProvider } from "./src/context/AppData";
import RootStack from "./src/navigation/RootNavigator";
import LoginScreen  from "./src/screens/LoginScreen";
import OfflineBanner from "./src/screens/OfflineBanner";
import { useNotifications } from "./src/hooks/useNotifications";
import { useIsOnline } from "./src/hooks/useOfflineQueue";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { APP_SCHEME, UNIVERSAL_LINK_ORIGIN, isAuthCallback, targetForRoute } from "./src/services/deepLinks";
import { linkingConfig } from "./src/navigation/linking";
import { parseNotificationRoute } from "./src/services/notificationService";
import { HOMEGENTIC_WEB_URL } from "./src/services/reportService";
import { v3 } from "./src/theme";
import type { RootStackParamList } from "./src/navigation/types";

// Deep links: paths in navigation/linking.ts; this adds the sources (launch
// URL, URL events, notification taps). https://homegentic.app links open here
// too (universal links, see UNIVERSAL_LINK_PATHS).
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [APP_SCHEME, UNIVERSAL_LINK_ORIGIN],
  config: linkingConfig,
  // The container mounts after sign-in, so a link or notification tap that
  // opened the app while signed out is still picked up here.
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    if (url && !isAuthCallback(url) && !handledUrls.has(url)) {
      handledUrls.add(url);
      return url;
    }
    const response = Notifications.getLastNotificationResponse();
    if (response && !handledNotifications.has(response.notification.request.identifier)) {
      handledNotifications.add(response.notification.request.identifier);
      return appUrlFor(parseNotificationRoute(response.notification.request.content.data));
    }
    return null;
  },
  subscribe(listener) {
    const links = Linking.addEventListener("url", ({ url }) => {
      if (!isAuthCallback(url)) listener(url);
    });
    const taps = Notifications.addNotificationResponseReceivedListener((response) => {
      const id = response.notification.request.identifier;
      if (handledNotifications.has(id)) return;
      handledNotifications.add(id);
      const url = appUrlFor(parseNotificationRoute(response.notification.request.content.data));
      if (url) listener(url);
    });
    return () => { links.remove(); taps.remove(); };
  },
};

// Links already acted on, so signing out and back in doesn't replay them.
const handledUrls = new Set<string>();
const handledNotifications = new Set<string>();

/** App URL for a notification route; web-only routes open in the browser instead. */
function appUrlFor(route: string | null): string | null {
  const target = targetForRoute(route);
  if (!target) return null;
  if (target.kind === "web") {
    WebBrowser.openBrowserAsync(`${HOMEGENTIC_WEB_URL.replace(/\/$/, "")}${target.path}`).catch(() => {});
    return null;
  }
  return target.url;
}

const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: v3.bg, card: v3.paper, primary: v3.blue, text: v3.ink, border: v3.line } };

function Root() {
  const { authState } = useAuthContext();
  const isOnline = useIsOnline();

  // 15.3.5 — register the push token; taps are routed by `linking` above
  useNotifications();

  return (
    <View style={styles.root}>
      {authState.status === "authenticated" ? (
        <AppDataProvider key={authState.principal}>
          <NavigationContainer linking={linking} theme={navTheme}>
            <RootStack />
          </NavigationContainer>
        </AppDataProvider>
      ) : (
        <LoginScreen />
      )}
      <OfflineBanner offline={!isOnline} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: v3.bg },
});

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold,
    HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold,
    JetBrainsMono_400Regular, JetBrainsMono_500Medium, JetBrainsMono_700Bold,
  });
  // The fonts are bundled, so this is quick. If they fail to load, carry on
  // with the system font rather than a blank screen.
  if (!fontsLoaded && !fontError) return <View style={styles.root} />;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <Root />
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
