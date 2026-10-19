import React from "react";
import { Linking } from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import { useAppData } from "../../context/AppData";
import { useLoad } from "../../hooks/useLoad";
import { useOfflineQueue } from "../../hooks/useOfflineQueue";
import { getMyContractorProfile } from "../../services/contractorService";
import { HOMEGENTIC_WEB_URL } from "../../services/reportService";
import { serviceTypeLabel } from "@homegentic/shared/serviceTypes";
import { PlanCard } from "../../components/PlanCard";
import { PageHeader, TabScroll } from "../../components/ui";
import { SettingsCard, useNotificationsSetting, useSignOut } from "./AccountScreen";
import { v3 } from "../../theme";

export default function ContractorAccountScreen() {
  const app = useAppData();
  const navigation = useNavigation<any>();
  const signOut = useSignOut();
  const notifications = useNotificationsSetting();
  const { pendingCount, failedCount } = useOfflineQueue();
  const queued = pendingCount + failedCount;
  const profile = useLoad(() => getMyContractorProfile(), "profile");

  const trades = profile.data?.specialties.length
    ? profile.data.specialties.slice(0, 2).map((t) => serviceTypeLabel(t).toUpperCase()).join(", ") + (profile.data.specialties.length > 2 ? " +" : "")
    : "NONE SET";

  return (
    <TabScroll refreshing={profile.loading && !!profile.data} onRefresh={() => { profile.reload(); app.refreshPlan(); }}>
      <PageHeader kicker="ACCOUNT" title={profile.data?.name || app.displayName} />
      <PlanCard />
      <SettingsCard
        rows={[
          { label: "Offline queue", value: queued ? `${queued} WAITING` : "EMPTY", valueColor: queued ? v3.red : v3.muted, onPress: () => navigation.navigate("QueueStatus") },
          { label: "Trades", value: trades, onPress: () => WebBrowser.openBrowserAsync(`${HOMEGENTIC_WEB_URL.replace(/\/$/, "")}/contractor-dashboard`) },
          { label: "Notifications", value: notifications, onPress: () => Linking.openSettings() },
          { label: "Sign out", value: "", color: v3.red, onPress: signOut },
        ]}
      />
    </TabScroll>
  );
}
