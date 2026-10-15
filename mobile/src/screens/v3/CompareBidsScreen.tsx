import React, { useState } from "react";
import { Alert, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { useLoad } from "../../hooks/useLoad";
import { acceptBid, Bid, getBids } from "../../services/quoteService";
import { Card, Chip, chipTone, EmptyRow, Kicker, Loading, Pill, PushedScroll } from "../../components/ui";
import { family, type, v3 } from "../../theme";

type Props = NativeStackScreenProps<RootStackParamList, "CompareBids">;

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function CompareBidsScreen({ route, navigation }: Props) {
  const { requestId, title } = route.params;
  const bids = useLoad(() => getBids(requestId), requestId);
  const [accepting, setAccepting] = useState<string | null>(null);

  const list = bids.data ?? [];
  const accepted = list.find((b) => b.status === "Accepted");
  const low = list.length ? Math.min(...list.map((b) => b.amountCents)) : 0;

  function confirm(b: Bid) {
    Alert.alert(
      `Accept ${b.contractorName}?`,
      `${money(b.amountCents)}, about ${b.timelineDays} days. The other bids will be declined.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          onPress: async () => {
            setAccepting(b.id);
            try {
              await acceptBid(b.id);
              await bids.reload();
            } catch (e: any) {
              Alert.alert("Couldn't accept the bid", e?.message ?? "Try again in a moment.");
            } finally {
              setAccepting(null);
            }
          },
        },
      ],
    );
  }

  return (
    <PushedScroll backLabel="Jobs" onBack={navigation.goBack} refreshing={bids.loading && !!bids.data} onRefresh={bids.reload}>
      <Kicker style={{ marginTop: 12 }}>COMPARE BIDS</Kicker>
      <Text style={[type.pageTitle, { marginTop: 10 }]}>{title}</Text>
      <Text style={[type.body, { fontSize: 13, lineHeight: 20.8, marginTop: 9 }]}>
        {accepted
          ? `You accepted ${accepted.contractorName}. They'll get in touch to schedule.`
          : "Verified contractors have their license and past jobs checked. Accepting one declines the rest."}
      </Text>

      <Card style={{ marginTop: 18 }}>
        {bids.loading && !bids.data ? (
          <Loading />
        ) : list.length === 0 ? (
          <EmptyRow text={bids.error ? "Couldn't load bids." : "No bids yet."} />
        ) : (
          list.map((b, i) => {
            const tone = b.status === "Accepted" ? chipTone.blue : b.verified ? chipTone.blue : chipTone.muted;
            return (
              <View key={b.id} style={{ padding: 18, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: v3.lineSoft }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[type.rowTitle, { fontSize: 15 }]}>{b.contractorName}</Text>
                    <Text style={[type.meta, { fontSize: 11, marginTop: 5 }]}>
                      {b.jobsCompleted} {b.jobsCompleted === 1 ? "JOB" : "JOBS"} DONE · {b.timelineDays} DAYS
                      {b.amountCents === low && list.length > 1 ? " · LOWEST" : ""}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: family.displayBold, fontSize: 18, letterSpacing: -0.54, color: v3.ink }}>{money(b.amountCents)}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 }}>
                  <Chip label={b.status === "Accepted" ? "ACCEPTED" : b.verified ? "VERIFIED" : "UNVERIFIED"} color={tone.color} bg={tone.bg} />
                  {!accepted && b.status === "Pending" && (
                    <Pill label="Accept bid" small loading={accepting === b.id} onPress={() => confirm(b)} style={{ marginLeft: "auto" }} />
                  )}
                </View>
              </View>
            );
          })
        )}
      </Card>
    </PushedScroll>
  );
}
