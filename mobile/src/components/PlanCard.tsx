import React from "react";
import { Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAppData, AppData } from "../context/AppData";
import { tierName } from "../services/planService";
import { family, type, v3 } from "../theme";
import { Card, Kicker } from "./ui";

const DATE = { month: "short", day: "numeric", year: "numeric" } as const;

/** The grey line under the plan name. */
export function planUsage(app: Pick<AppData, "contractor" | "pro" | "properties" | "limits" | "subscription" | "usage">): string {
  if (app.contractor) {
    return app.pro ? "$40 a month · billed on homegentic.app" : "3% per winning bid, $20 minimum";
  }
  const n = app.properties.length;
  const props = `${n} of ${app.limits.propertyLimit} ${app.limits.propertyLimit === 1 ? "property" : "properties"}`;
  if (app.pro) {
    const exp = app.subscription?.expiresAt;
    if (!exp) return props;
    const when = new Date(exp).toLocaleDateString("en-US", DATE);
    return `${props} · ${app.subscription?.cancelled ? "ends" : "renews"} ${when}`;
  }
  if (app.usage && app.usage.limit > 0) {
    const left = Math.max(app.usage.limit - app.usage.used, 0);
    return `${props} · ${left} of ${app.usage.limit} AI calls left this ${app.usage.period}`;
  }
  return props;
}

/** "CURRENT PLAN" card — opens the web hand-off screen. */
export function PlanCard({ flat }: { flat?: boolean }) {
  const app = useAppData();
  const navigation = useNavigation<any>();
  return (
    <Card
      flat={flat}
      onPress={() => navigation.navigate("Upgrade")}
      accessibilityLabel={app.pro ? "Manage plan" : "Upgrade plan"}
      style={{ padding: flat ? 18 : 20, flexDirection: "row", alignItems: "center", gap: 14 }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Kicker>CURRENT PLAN</Kicker>
        <Text style={{ fontFamily: family.displayBold, fontSize: flat ? 16 : 17, lineHeight: 20, letterSpacing: -0.34, color: v3.ink, marginTop: 9 }}>
          {tierName(app.tier)} plan
        </Text>
        <Text style={[type.body, { lineHeight: 18, marginTop: 6 }]}>{planUsage(app)}</Text>
      </View>
      <View
        style={{
          minHeight: 40,
          justifyContent: "center",
          paddingVertical: 11,
          paddingHorizontal: 17,
          borderRadius: 100,
          backgroundColor: v3.blueTint,
          borderWidth: 1,
          borderColor: v3.blueLine,
        }}
      >
        <Text style={{ fontFamily: family.bodySemi, fontSize: 12.5, color: v3.blue }}>{app.pro ? "Manage" : "Upgrade"}</Text>
      </View>
    </Card>
  );
}
