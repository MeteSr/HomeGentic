import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { useAppData } from "../context/AppData";
import { useOfflineQueue } from "../hooks/useOfflineQueue";
import { usePendingProposals } from "../hooks/usePendingProposals";
import { getJobsPendingMySignature } from "../services/jobService";
import { AssistantSheet } from "../components/AssistantSheet";
import { PropertySheet } from "../components/PropertySheet";
import { AskButton, TabBar, TabSpec } from "./TabBar";
import type { ContractorTabParamList, HomeownerTabParamList } from "./types";
import HomeScreen from "../screens/v3/HomeScreen";
import PropertyScreen from "../screens/v3/PropertyScreen";
import JobsScreen from "../screens/v3/JobsScreen";
import UpkeepScreen from "../screens/v3/UpkeepScreen";
import AccountScreen from "../screens/v3/AccountScreen";
import ContractorAccountScreen from "../screens/v3/ContractorAccountScreen";
import LeadFeedScreen from "../screens/LeadFeedScreen";
import PendingSignaturesScreen from "../screens/PendingSignaturesScreen";
import EarningsScreen from "../screens/EarningsScreen";
import { v3 } from "../theme";

const HomeownerTab  = createBottomTabNavigator<HomeownerTabParamList>();
const ContractorTab = createBottomTabNavigator<ContractorTabParamList>();

/** Jobs waiting on the signed-in user's signature, refreshed when the tabs regain focus. */
function useMySignatureCount(contractor: boolean): number {
  const [n, setN] = useState(0);
  useFocusEffect(useCallback(() => {
    let live = true;
    getJobsPendingMySignature()
      .then((jobs) => live && setN(jobs.filter((j) => (contractor ? !j.contractorSigned : !j.homeownerSigned)).length))
      .catch(() => {});
    return () => { live = false; };
  }, [contractor]));
  return n;
}

function HomeownerTabs() {
  const { pendingCount, failedCount } = useOfflineQueue();
  const proposals = usePendingProposals();
  const toSign = useMySignatureCount(false);
  const specs: Record<keyof HomeownerTabParamList, TabSpec> = {
    Home:     { label: "Home",     icon: "home" },
    Property: { label: "Property", icon: "property" },
    Jobs:     { label: "Jobs",     icon: "jobs",    dot: proposals + toSign > 0 ? v3.blue : null },
    Upkeep:   { label: "Upkeep",   icon: "upkeep" },
    Account:  { label: "Account",  icon: "account", dot: pendingCount + failedCount > 0 ? v3.red : null },
  };
  return (
    <HomeownerTab.Navigator screenOptions={{ headerShown: false }} tabBar={(p) => <TabBar {...p} specs={specs} />}>
      <HomeownerTab.Screen name="Home"     component={HomeScreen} />
      <HomeownerTab.Screen name="Property" component={PropertyScreen} />
      <HomeownerTab.Screen name="Jobs"     component={JobsScreen} />
      <HomeownerTab.Screen name="Upkeep"   component={UpkeepScreen} />
      <HomeownerTab.Screen name="Account"  component={AccountScreen} />
    </HomeownerTab.Navigator>
  );
}

function ContractorTabs() {
  const { pendingCount, failedCount } = useOfflineQueue();
  const toSign = useMySignatureCount(true);
  const specs: Record<keyof ContractorTabParamList, TabSpec> = {
    Leads:    { label: "Leads",    icon: "leads" },
    Sign:     { label: "Sign",     icon: "sign",     dot: toSign > 0 ? v3.blue : null },
    Earnings: { label: "Earnings", icon: "earnings" },
    CAccount: { label: "Account",  icon: "user",     dot: pendingCount + failedCount > 0 ? v3.red : null },
  };
  return (
    <ContractorTab.Navigator screenOptions={{ headerShown: false }} tabBar={(p) => <TabBar {...p} specs={specs} />}>
      <ContractorTab.Screen name="Leads"    component={LeadFeedScreen} />
      <ContractorTab.Screen name="Sign"     component={PendingSignaturesScreen} />
      <ContractorTab.Screen name="Earnings" component={EarningsScreen} />
      <ContractorTab.Screen name="CAccount" component={ContractorAccountScreen} />
    </ContractorTab.Navigator>
  );
}

/** The role's tab set, the floating assistant button, and the two global sheets. */
export default function TabNavigator() {
  const app = useAppData();
  return (
    <View style={{ flex: 1, backgroundColor: v3.bg }}>
      {app.contractor ? <ContractorTabs /> : <HomeownerTabs />}
      <AskButton onPress={app.openAsk} />
      <AssistantSheet />
      {!app.contractor && <PropertySheet />}
    </View>
  );
}
