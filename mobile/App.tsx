import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import TabNavigator from "./src/navigation/TabNavigator";
import { colors } from "./src/theme";

const linking = {
  prefixes: ["homefax://"],
  config: {
    screens: {
      Chat:     "chat",
      Photos:   "photos/:jobId?",
      Report:   "report/:token?",
      Settings: "settings",
    },
  },
};

export default function App() {
  return (
    <NavigationContainer linking={linking}>
      <StatusBar style="dark" backgroundColor={colors.paper} />
      <TabNavigator />
    </NavigationContainer>
  );
}
