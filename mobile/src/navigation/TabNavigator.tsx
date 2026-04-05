import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";
import { colors, fonts } from "../theme";
import ChatScreen    from "../screens/ChatScreen";
import PhotosScreen  from "../screens/PhotosScreen";
import ReportScreen  from "../screens/ReportScreen";
import SettingsScreen from "../screens/SettingsScreen";

export type TabParamList = {
  Chat:     undefined;
  Photos:   undefined;
  Report:   undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      style={{
        fontFamily: fonts.mono,
        fontSize: 10,
        letterSpacing: 1,
        color: focused ? colors.rust : colors.inkLight,
        marginTop: 2,
      }}
    >
      {label}
    </Text>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopWidth: 1,
          borderTopColor: colors.rule,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor:   colors.rust,
        tabBarInactiveTintColor: colors.inkLight,
        tabBarLabelStyle: {
          fontFamily: fonts.mono,
          fontSize: 10,
          letterSpacing: 1,
        },
      }}
    >
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          tabBarLabel: "CHAT",
          tabBarIcon: ({ focused }) => <TabIcon label="◎" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Photos"
        component={PhotosScreen}
        options={{
          tabBarLabel: "PHOTOS",
          tabBarIcon: ({ focused }) => <TabIcon label="⬜" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Report"
        component={ReportScreen}
        options={{
          tabBarLabel: "REPORT",
          tabBarIcon: ({ focused }) => <TabIcon label="▤" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: "SETTINGS",
          tabBarIcon: ({ focused }) => <TabIcon label="≡" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}
