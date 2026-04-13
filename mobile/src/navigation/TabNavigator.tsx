import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, View } from "react-native";
import { colors, fonts } from "../theme";
import { useAuthContext } from "../auth/AuthContext";
import ChatStack        from "./ChatStack";
import ContractorStack  from "./ContractorStack";
import EarningsStack    from "./EarningsStack";
import SettingsStack    from "./SettingsStack";
import PhotosScreen     from "../screens/PhotosScreen";
import ReportScreen     from "../screens/ReportScreen";
import LeadFeedScreen   from "../screens/LeadFeedScreen";
import { useOfflineQueue }       from "../hooks/useOfflineQueue";
import { usePendingProposals }   from "../hooks/usePendingProposals";

export type HomeownerTabParamList = {
  Chat:     undefined;
  Photos:   undefined;
  Report:   undefined;
  Settings: undefined;
};

export type ContractorTabParamList = {
  Chat:     undefined;
  Leads:    undefined;
  Earnings: undefined;
  Settings: undefined;
};

const HomeownerTab  = createBottomTabNavigator<HomeownerTabParamList>();
const ContractorTab = createBottomTabNavigator<ContractorTabParamList>();

function TabIcon({ label, focused, badge }: { label: string; focused: boolean; badge?: number }) {
  return (
    <View style={{ alignItems: "center" }}>
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
      {badge != null && badge > 0 && (
        <View style={{
          position: "absolute", top: -4, right: -8,
          backgroundColor: colors.rust, borderRadius: 6,
          minWidth: 12, height: 12, alignItems: "center", justifyContent: "center",
          paddingHorizontal: 2,
        }}>
          <Text style={{ fontFamily: fonts.mono, fontSize: 8, color: "#fff" }}>{badge}</Text>
        </View>
      )}
    </View>
  );
}

const TAB_BAR_STYLE = {
  backgroundColor: colors.paper,
  borderTopWidth: 1,
  borderTopColor: colors.rule,
  height: 60,
  paddingBottom: 8,
} as const;

const SCREEN_OPTIONS = {
  headerShown:           false,
  tabBarStyle:           TAB_BAR_STYLE,
  tabBarActiveTintColor:   colors.rust,
  tabBarInactiveTintColor: colors.inkLight,
  tabBarLabelStyle: {
    fontFamily: fonts.mono,
    fontSize:   10,
    letterSpacing: 1,
  },
} as const;

function HomeownerTabs() {
  const { pendingCount, failedCount } = useOfflineQueue();
  const queueBadge        = pendingCount + failedCount;
  const pendingProposals  = usePendingProposals();
  return (
    <HomeownerTab.Navigator screenOptions={SCREEN_OPTIONS}>
      <HomeownerTab.Screen
        name="Chat"
        component={ChatStack}
        options={{ tabBarLabel: "CHAT", tabBarIcon: ({ focused }) => <TabIcon label="◎" focused={focused} badge={pendingProposals} /> }}
      />
      <HomeownerTab.Screen
        name="Photos"
        component={PhotosScreen}
        options={{ tabBarLabel: "PHOTOS", tabBarIcon: ({ focused }) => <TabIcon label="⬜" focused={focused} /> }}
      />
      <HomeownerTab.Screen
        name="Report"
        component={ReportScreen}
        options={{ tabBarLabel: "REPORT", tabBarIcon: ({ focused }) => <TabIcon label="▤" focused={focused} /> }}
      />
      <HomeownerTab.Screen
        name="Settings"
        component={SettingsStack}
        options={{ tabBarLabel: "SETTINGS", tabBarIcon: ({ focused }) => <TabIcon label="≡" focused={focused} badge={queueBadge} /> }}
      />
    </HomeownerTab.Navigator>
  );
}

function ContractorTabs() {
  const { pendingCount, failedCount } = useOfflineQueue();
  const queueBadge = pendingCount + failedCount;
  return (
    <ContractorTab.Navigator screenOptions={SCREEN_OPTIONS}>
      <ContractorTab.Screen
        name="Chat"
        component={ContractorStack}
        options={{ tabBarLabel: "CHAT", tabBarIcon: ({ focused }) => <TabIcon label="◎" focused={focused} /> }}
      />
      <ContractorTab.Screen
        name="Leads"
        component={LeadFeedScreen}
        options={{ tabBarLabel: "LEADS", tabBarIcon: ({ focused }) => <TabIcon label="◈" focused={focused} /> }}
      />
      <ContractorTab.Screen
        name="Earnings"
        component={EarningsStack}
        options={{ tabBarLabel: "EARNINGS", tabBarIcon: ({ focused }) => <TabIcon label="$" focused={focused} /> }}
      />
      <ContractorTab.Screen
        name="Settings"
        component={SettingsStack}
        options={{ tabBarLabel: "SETTINGS", tabBarIcon: ({ focused }) => <TabIcon label="≡" focused={focused} badge={queueBadge} /> }}
      />
    </ContractorTab.Navigator>
  );
}

export default function TabNavigator() {
  const { authState } = useAuthContext();
  const role = authState.status === "authenticated" ? authState.profile?.role : undefined;
  return role === "Contractor" ? <ContractorTabs /> : <HomeownerTabs />;
}
