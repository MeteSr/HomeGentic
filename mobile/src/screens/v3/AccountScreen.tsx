import React, { useCallback, useState } from "react";
import { Alert, Linking, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import * as WebBrowser from "expo-web-browser";
import { useAuthContext } from "../../auth/AuthContext";
import { useAppData } from "../../context/AppData";
import { useLoad } from "../../hooks/useLoad";
import { useOfflineQueue } from "../../hooks/useOfflineQueue";
import { clearAgentSession } from "../../services/agentSession";
import { getApprovals, getManagers, initials, PropertyManager, spendLimitLabel } from "../../services/propertyService";
import { HOMEGENTIC_WEB_URL } from "../../services/reportService";
import { PlanCard } from "../../components/PlanCard";
import { AddRow, Callout, Card, Chip, EmptyRow, IconTile, Kicker, PageHeader, Pill, Row, SectionLabel, TabScroll } from "../../components/ui";
import { family, type, v3 } from "../../theme";

export function managerMeta(m: PropertyManager): string {
  switch (m.role) {
    case "Manager": return m.spendLimitCents == null ? "Books work with no limit" : `Can book up to ${spendLimitLabel(m.spendLimitCents)}`;
    case "CoOwner": return "Full access";
    default:        return "Records only";
  }
}

export const ROLE_CHIP: Record<PropertyManager["role"], string> = { Manager: "MANAGER", Viewer: "VIEWER", CoOwner: "CO-OWNER" };

export interface SettingRow { label: string; value: string; color?: string; valueColor?: string; onPress: () => void }

export function SettingsCard({ rows }: { rows: SettingRow[] }) {
  return (
    <Card flat style={{ marginTop: 14 }}>
      {rows.map((r, i) => (
        <Row key={r.label} last={i === rows.length - 1} onPress={r.onPress} style={{ paddingVertical: 16, justifyContent: "space-between", gap: 12 }} accessibilityLabel={r.value ? `${r.label}, ${r.value}` : r.label}>
          <Text style={{ fontFamily: family.bodySemi, fontSize: 14, lineHeight: 18, color: r.color ?? v3.ink }}>{r.label}</Text>
          <Text style={{ fontFamily: family.mono, fontSize: 12, color: r.valueColor ?? v3.muted }}>{r.value}</Text>
        </Row>
      ))}
    </Card>
  );
}

/** Confirms, then signs out and forgets the cached agent session. */
export function useSignOut() {
  const { logout } = useAuthContext();
  return useCallback(() => {
    Alert.alert("Sign out?", "You'll need Internet Identity to sign back in.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => { clearAgentSession(); logout(); } },
    ]);
  }, [logout]);
}

/** "ON" / "OFF" for push permission, refreshed when the screen gains focus. */
export function useNotificationsSetting(): string {
  const [value, setValue] = useState("");
  useFocusEffect(useCallback(() => {
    Notifications.getPermissionsAsync().then((p) => setValue(p.granted ? "ON" : "OFF")).catch(() => setValue(""));
  }, []));
  return value;
}

export default function AccountScreen() {
  const app = useAppData();
  const navigation = useNavigation<any>();
  const signOut = useSignOut();
  const notifications = useNotificationsSetting();
  const { pendingCount, failedCount } = useOfflineQueue();
  const queued = pendingCount + failedCount;
  const prop = app.activeProperty;

  const shared = useLoad(async () => {
    if (!prop || !app.pro) return null;
    const [managers, approvals] = await Promise.all([
      getManagers(prop.id),
      getApprovals(prop.id).catch(() => []),
    ]);
    return { managers, waiting: approvals.filter((a) => a.status === "Pending").length };
  }, `${prop?.id}:${app.pro}`);

  const rows: SettingRow[] = [
    {
      label: "Offline queue",
      value: queued ? `${queued} WAITING` : "EMPTY",
      valueColor: queued ? v3.red : v3.muted,
      onPress: () => navigation.navigate("QueueStatus"),
    },
    { label: "Notifications", value: notifications, onPress: () => Linking.openSettings() },
    {
      label: "Export records",
      value: app.pro ? "PDF" : "PRO",
      onPress: () => app.pro && prop
        ? WebBrowser.openBrowserAsync(`${HOMEGENTIC_WEB_URL.replace(/\/$/, "")}/properties/${prop.id}`)
        : navigation.navigate("Upgrade"),
    },
    { label: "Open a shared report", value: "LINK", onPress: () => navigation.navigate("Report") },
    { label: "Sign out", value: "", color: v3.red, onPress: signOut },
  ];

  const managers = shared.data?.managers ?? [];

  return (
    <TabScroll refreshing={shared.loading && !!shared.data} onRefresh={() => { shared.reload(); app.refreshPlan(); app.refreshUsage(); }}>
      <PageHeader kicker="ACCOUNT" title={app.displayName} />
      <PlanCard />

      <SectionLabel
        right={app.pro ? (
          <Row onPress={() => navigation.navigate("People")} style={{ padding: 0, paddingVertical: 0, paddingHorizontal: 0, minHeight: 32, borderBottomWidth: 0, gap: 8 }} accessibilityLabel="Manage shared access">
            {!!shared.data?.waiting && (
              <Chip label={`${shared.data.waiting} WAITING`} color={v3.ink} bg={v3.yellowTint} border={v3.yellow} style={{ paddingVertical: 5, paddingHorizontal: 8 }} />
            )}
            <Text style={{ fontFamily: family.bodySemi, fontSize: 12.5, color: v3.blue }}>Manage</Text>
          </Row>
        ) : undefined}
      >
        SHARED ACCESS
      </SectionLabel>

      {!app.pro ? (
        <Callout>
          <Kicker color={v3.ink} style={{ letterSpacing: 1.08 }}>PART OF PRO</Kicker>
          <Text style={{ fontFamily: family.body, fontSize: 13.5, lineHeight: 20.9, color: v3.ink, marginTop: 10 }}>
            Invite family or a property manager as a Viewer or Manager. Everything they do is logged on your behalf.
          </Text>
          <Pill label="Upgrade on the web" variant="ink" style={{ marginTop: 14 }} onPress={() => navigation.navigate("Upgrade")} />
        </Callout>
      ) : (
        <Card flat>
          {shared.error ? (
            <EmptyRow text="Couldn't load who has access." />
          ) : managers.length === 0 ? (
            <EmptyRow text={shared.loading ? "Loading…" : "Only you have access."} />
          ) : (
            managers.map((m) => (
              <Row key={m.principal} onPress={() => navigation.navigate("People")} accessibilityLabel={`${m.displayName}, ${ROLE_CHIP[m.role]}`}>
                <IconTile abbr={initials(m.displayName)} round />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.rowTitle, { fontSize: 14 }]}>{m.displayName}</Text>
                  <Text style={{ fontFamily: family.body, fontSize: 11.5, lineHeight: 16, color: v3.muted, marginTop: 5 }}>{managerMeta(m)}</Text>
                </View>
                <Chip label={ROLE_CHIP[m.role]} border={v3.chipLine} />
              </Row>
            ))
          )}
          <AddRow label="Invite someone" onPress={() => navigation.navigate("People")} />
        </Card>
      )}

      <SettingsCard rows={rows} />
    </TabScroll>
  );
}
