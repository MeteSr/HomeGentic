import React from "react";
import { Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useLoad } from "../hooks/useLoad";
import { formatEarnings, getPendingSignatureJobs, sortPendingJobs } from "../services/contractorService";
import { getStreetAddresses } from "../services/propertyService";
import { serviceTypeLabel } from "../services/serviceTypes";
import { Card, Chip, chipTone, EmptyRow, Loading, PageHeader, Pill, TabScroll } from "../components/ui";
import { family, type, v3 } from "../theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function shortDate(iso: string): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export default function PendingSignaturesScreen() {
  const navigation = useNavigation<Nav>();
  const data = useLoad(async () => {
    const jobs = sortPendingJobs(await getPendingSignatureJobs());
    const streets = await getStreetAddresses(jobs.map((j) => j.propertyAddress)).catch(() => ({} as Record<string, string>));
    return jobs.map((j) => ({ ...j, street: streets[j.propertyAddress] ?? "Client property" }));
  }, "sigs");

  const jobs = data.data ?? [];
  const waiting = jobs.filter((j) => j.awaitingRole === "contractor").length;

  return (
    <TabScroll refreshing={data.loading && !!data.data} onRefresh={data.reload}>
      <PageHeader kicker="PENDING SIGNATURES" title={!data.data ? " " : waiting ? `${waiting} waiting on you` : "All caught up"} />
      <Card>
        {!data.data ? (
          data.loading ? <Loading /> : <EmptyRow text="Couldn't load signatures. Pull to retry." />
        ) : jobs.length === 0 ? (
          <EmptyRow text="Nothing to sign. Completed jobs show up here once the homeowner logs them." />
        ) : (
          jobs.map((j, i) => {
            const yours = j.awaitingRole === "contractor";
            const tone = yours ? chipTone.red : chipTone.muted;
            return (
              <View key={j.id} style={{ paddingVertical: 16, paddingHorizontal: 18, borderBottomWidth: i === jobs.length - 1 ? 0 : 1, borderBottomColor: v3.lineSoft }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={type.rowTitle}>{serviceTypeLabel(j.serviceType)}</Text>
                    <Text style={{ fontFamily: family.body, fontSize: 12, lineHeight: 16.8, color: v3.muted, marginTop: 4 }}>{j.street}</Text>
                    <Text style={[type.meta, { fontSize: 11, lineHeight: 15.4, marginTop: 5 }]}>
                      {[shortDate(j.completedDate), formatEarnings(j.amountCents)].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <Chip label={yours ? "AWAITING YOU" : "AWAITING HOMEOWNER"} color={tone.color} bg={tone.bg} />
                </View>
                {yours && (
                  <Pill
                    label="Sign job"
                    small
                    style={{ marginTop: 12 }}
                    onPress={() => navigation.navigate("SignJob", {
                      currentRole: "contractor",
                      job: {
                        id: j.id, serviceType: serviceTypeLabel(j.serviceType), propertyAddress: j.street,
                        amountCents: j.amountCents, completedDate: j.completedDate, awaitingRole: "contractor",
                      },
                    })}
                  />
                )}
              </View>
            );
          })
        )}
      </Card>
    </TabScroll>
  );
}
