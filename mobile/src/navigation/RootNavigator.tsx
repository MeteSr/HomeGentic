import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./types";
import TabNavigator from "./TabNavigator";
import PeopleScreen from "../screens/v3/PeopleScreen";
import UpgradeScreen from "../screens/v3/UpgradeScreen";
import CompareBidsScreen from "../screens/v3/CompareBidsScreen";
import AddRecurringScreen from "../screens/v3/AddRecurringScreen";
import PropertyDetailScreen from "../screens/PropertyDetailScreen";
import LogJobScreen from "../screens/LogJobScreen";
import QuoteRequestScreen from "../screens/QuoteRequestScreen";
import MyQuotesScreen from "../screens/MyQuotesScreen";
import SignJobScreen from "../screens/SignJobScreen";
import PhotoUploadScreen from "../screens/PhotoUploadScreen";
import BillUploadScreen from "../screens/BillUploadScreen";
import ScanDocumentScreen from "../screens/ScanDocumentScreen";
import LeadDetailScreen from "../screens/LeadDetailScreen";
import QueueStatusScreen from "../screens/QueueStatusScreen";
import ReportScreen from "../screens/ReportScreen";
import { useOfflineQueue } from "../hooks/useOfflineQueue";
import { family, v3 } from "../theme";

const Stack = createNativeStackNavigator<RootStackParamList>();

function QueueStatusRoute() {
  const { items, retry, discard } = useOfflineQueue();
  return <QueueStatusScreen items={items} onRetry={retry} onDiscard={discard} />;
}

/**
 * Tabs at the root; everything else pushes over them full-screen (no tab
 * bar). v3 screens draw their own back link; the older forms keep a native
 * header styled to match.
 */
export default function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle:         { backgroundColor: v3.paper },
        headerTintColor:     v3.ink,
        headerTitleStyle:    { fontFamily: family.monoMedium, fontSize: 11 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        contentStyle:        { backgroundColor: v3.bg },
      }}
    >
      <Stack.Screen name="Tabs"         component={TabNavigator}       options={{ headerShown: false }} />
      <Stack.Screen name="People"       component={PeopleScreen}       options={{ headerShown: false }} />
      <Stack.Screen name="Upgrade"      component={UpgradeScreen}      options={{ headerShown: false }} />
      <Stack.Screen name="CompareBids"  component={CompareBidsScreen}  options={{ headerShown: false }} />
      <Stack.Screen name="AddRecurring" component={AddRecurringScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PropertyDetail" component={PropertyDetailScreen} options={{ title: "JOB HISTORY" }} />
      <Stack.Screen name="LogJob"       component={LogJobScreen}       options={{ title: "LOG A JOB" }} />
      <Stack.Screen name="QuoteRequest" component={QuoteRequestScreen} options={{ title: "REQUEST A QUOTE" }} />
      <Stack.Screen name="MyQuotes"     component={MyQuotesScreen}     options={{ title: "QUOTE REQUESTS" }} />
      <Stack.Screen name="SignJob"      component={SignJobScreen}      options={{ title: "SIGN JOB" }} />
      <Stack.Screen name="PhotoUpload"  component={PhotoUploadScreen}  options={{ title: "ADD PHOTO", headerStyle: { backgroundColor: v3.ink }, headerTintColor: v3.paper }} />
      <Stack.Screen name="BillUpload"   component={BillUploadScreen}   options={{ title: "UTILITY BILL" }} />
      <Stack.Screen name="ScanDocument" component={ScanDocumentScreen} options={{ title: "SCAN A DOCUMENT" }} />
      <Stack.Screen name="LeadDetail"   component={LeadDetailScreen}   options={{ title: "LEAD" }} />
      <Stack.Screen name="QueueStatus"  component={QueueStatusRoute}   options={{ title: "OFFLINE QUEUE" }} />
      <Stack.Screen name="Report"       component={ReportScreen}       options={{ title: "SHARED REPORT" }} />
    </Stack.Navigator>
  );
}
