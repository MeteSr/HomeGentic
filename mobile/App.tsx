import React from "react";
import { View, StyleSheet } from "react-native";
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
import { useOfflineQueue } from "./src/hooks/useOfflineQueue";
import { v3 } from "./src/theme";
import type { RootStackParamList } from "./src/navigation/types";

// Deep-link → screen mapping.
// Routes emitted in push notification payloads (agents/notifications/events.ts)
// must match these paths: jobs/<id>, quotes/<id>, leads, leads/<id>.
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ["homegentic://"],
  config: {
    screens: {
      Tabs: {
        screens: {
          Home:     "dashboard",
          Property: "property",
          Jobs:     "jobs/:jobId?",
          Upkeep:   "upkeep",
          Account:  "account",
          Leads:    "leads/:leadId?",
          Sign:     "sign",
          Earnings: "earnings",
          CAccount: "contractor/account",
        },
      },
      MyQuotes: "quotes/:requestId",
      Report:   "report/:token?",
      People:   "people",
      Upgrade:  "plan",
    },
  },
};

const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: v3.bg, card: v3.paper, primary: v3.blue, text: v3.ink, border: v3.line } };

function Root() {
  const { authState } = useAuthContext();
  const { isOnline }  = useOfflineQueue();

  // 15.3.5 — register push token + wire notification tap handler
  useNotifications();

  return (
    <View style={styles.root}>
      <OfflineBanner offline={!isOnline} />
      {authState.status === "authenticated" ? (
        <AppDataProvider key={authState.principal}>
          <RootStack />
        </AppDataProvider>
      ) : (
        <LoginScreen />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: v3.bg },
});

export default function App() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold,
    HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold,
    JetBrainsMono_400Regular, JetBrainsMono_500Medium, JetBrainsMono_700Bold,
  });
  // The splash screen stays up until the fonts are ready (they're bundled, so this is quick).
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer linking={linking} theme={navTheme}>
          <StatusBar style="dark" backgroundColor={v3.bg} />
          <Root />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
