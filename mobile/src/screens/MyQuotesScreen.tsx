import React, { useEffect } from "react";
import { Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useAppData } from "../context/AppData";
import { useLoad } from "../hooks/useLoad";
import { getMyQuoteRequests, isOpenRequest, type QuoteRequest } from "../services/quoteService";
import { urgencyLabel } from "../services/quoteFormService";
import { serviceTypeLabel } from "../services/serviceTypes";
import { Card, Chip, chipTone, EmptyRow, Loading, Pill, Row } from "../components/ui";
import { type, v3 } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "MyQuotes">;

const STATUS_TONE: Record<QuoteRequest["status"], { color: string; bg: string }> = {
  open:     chipTone.blue,
  quoted:   chipTone.blue,
  accepted: chipTone.muted,
  closed:   chipTone.muted,
};

export default function MyQuotesScreen({ route, navigation }: Props) {
  const app = useAppData();
  const propertyId      = route.params?.propertyId ?? app.activeProperty?.id;
  const propertyAddress = route.params?.propertyAddress ?? app.activeProperty?.address ?? "";
  const requestId       = route.params?.requestId;

  // A "new quote" notification deep-links straight to that request's bids.
  useEffect(() => {
    if (requestId) navigation.replace("CompareBids", { requestId, title: "Bids" });
  }, [requestId, navigation]);

  const data = useLoad(async () => {
    const all = await getMyQuoteRequests(propertyId ?? "");
    return all.filter((r) => !propertyId || r.propertyId === propertyId).sort((a, b) => b.createdAt - a.createdAt);
  }, propertyId ?? "");

  const requests = data.data ?? [];
  const openCount = requests.filter(isOpenRequest).length;
  const atLimit = openCount >= app.limits.openQuotes;

  return (
    <View style={{ flex: 1, backgroundColor: v3.bg, padding: 18 }}>
      <Pill
        label={atLimit ? `Free allows ${app.limits.openQuotes} open requests — see Pro` : "New quote request"}
        icon={atLimit ? undefined : "plus"}
        block
        variant={atLimit ? "outline" : "primary"}
        onPress={() => atLimit || !propertyId
          ? navigation.navigate("Upgrade")
          : navigation.navigate("QuoteRequest", { propertyId, propertyAddress })}
      />
      <Card style={{ marginTop: 14 }}>
        {data.loading && !data.data ? (
          <Loading />
        ) : requests.length === 0 ? (
          <EmptyRow text={data.error ? "Couldn't load your requests." : "No requests yet. Ask for quotes and compare bids here."} />
        ) : (
          requests.map((r, i) => {
            const tone = STATUS_TONE[r.status];
            return (
              <Row
                key={r.id}
                last={i === requests.length - 1}
                style={{ alignItems: "flex-start" }}
                onPress={() => navigation.navigate("CompareBids", { requestId: r.id, title: r.description || serviceTypeLabel(r.serviceType) })}
                accessibilityLabel={`${serviceTypeLabel(r.serviceType)}, ${r.status}`}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={type.rowTitle}>{serviceTypeLabel(r.serviceType)}</Text>
                  <Text style={[type.body, { marginTop: 4 }]} numberOfLines={2}>{r.description}</Text>
                  <Text style={[type.meta, { fontSize: 11, marginTop: 6 }]}>
                    {urgencyLabel(r.urgency).toUpperCase()} URGENCY · {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}
                  </Text>
                </View>
                <Chip label={r.status.toUpperCase()} color={tone.color} bg={tone.bg} />
              </Row>
            );
          })
        )}
      </Card>
    </View>
  );
}
