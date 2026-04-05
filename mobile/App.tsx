import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuthContext } from "./src/auth/AuthContext";
import TabNavigator from "./src/navigation/TabNavigator";
import LoginScreen  from "./src/screens/LoginScreen";
import { useNotifications } from "./src/hooks/useNotifications";
import { colors } from "./src/theme";

// Deep-link → screen mapping.
// Routes emitted in push notification payloads must match these paths.
const linking = {
  prefixes: ["homegentic://"],
  config: {
    screens: {
      Chat:     "chat",
      Photos:   "photos/:jobId?",
      Report:   "report/:token?",
      Settings: "settings",
      // 15.3.6 — notification deep-link routes
      Jobs:     "jobs/:jobId?",
      Leads:    "leads/:leadId?",
      Earnings: "earnings",
    },
  },
};

function RootNavigator() {
  const { authState } = useAuthContext();

  // 15.3.5 — register push token + wire notification tap handler
  useNotifications();

  if (authState.status === "authenticated") {
    return <TabNavigator />;
  }

  // idle | loading | error → show login
  return <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer linking={linking}>
        <StatusBar style="dark" backgroundColor={colors.paper} />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
