import React from "react";
import { Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useLoad } from "../hooks/useLoad";
import { filterLeadsBySpecialties, getLeads, getMyContractorProfile, Lead } from "../services/contractorService";
import { getMyBidRequestIds } from "../services/bidService";
import { serviceTypeLabel } from "@homegentic/shared/serviceTypes";
import { closesLabel } from "./v3/JobsScreen";
import { Card, EmptyRow, Kicker, Loading, PageHeader, Pill, TabScroll } from "../components/ui";
import { family, shadow, type, v3 } from "../theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** "POSTED 2H AGO", "POSTED YESTERDAY", "POSTED 3D AGO". */
export function postedLabel(createdAt: number | undefined, now = Date.now()): string | null {
  if (!createdAt) return null;
  const hrs = Math.max(0, Math.floor((now - createdAt) / 3_600_000));
  if (hrs < 1)  return "POSTED JUST NOW";
  if (hrs < 24) return `POSTED ${hrs}H AGO`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "POSTED YESTERDAY" : `POSTED ${days}D AGO`;
}

function LeadCard({ lead, sent, onBid }: { lead: Lead; sent: boolean; onBid: () => void }) {
  const meta = [postedLabel(lead.createdAt), closesLabel(lead.closeAt ?? null)].filter(Boolean).join(" · ");
  return (
    <View style={[{ backgroundColor: v3.surface, borderWidth: 1, borderColor: v3.line, borderRadius: 22, padding: 18 }, shadow]}>
      {meta ? <Kicker style={{ letterSpacing: 0.9 }}>{meta}</Kicker> : null}
      <Text style={[type.cardTitle, { marginTop: meta ? 11 : 0 }]}>{serviceTypeLabel(lead.serviceType)}</Text>
      <Text style={[type.meta, { marginTop: 6 }]}>
        {[lead.propertyZip ? `ZIP ${lead.propertyZip}` : null, `${lead.urgency.toUpperCase()} URGENCY`].filter(Boolean).join(" · ")}
      </Text>
      <Text style={[type.body, { marginTop: 9 }]} numberOfLines={3}>{lead.description}</Text>
      <Pill
        label={sent ? "Bid sent" : "Submit a bid"}
        variant={sent ? "done" : "primary"}
        disabled={sent}
        style={{ marginTop: 14, opacity: 1 }}
        onPress={onBid}
      />
    </View>
  );
}

export default function LeadFeedScreen() {
  const navigation = useNavigation<Nav>();
  const data = useLoad(async () => {
    const [all, profile, sent] = await Promise.all([
      getLeads(),
      getMyContractorProfile().catch(() => null),
      getMyBidRequestIds().catch(() => new Set<string>()),
    ]);
    const trades = profile?.specialties ?? [];
    return { leads: filterLeadsBySpecialties(all, trades), trades, sent };
  }, "leads");

  const d = data.data;
  const trades = d?.trades.length ? d.trades.slice(0, 3).map((t) => serviceTypeLabel(t).toUpperCase()).join(", ") : "ALL TRADES";
  const open = d ? d.leads.filter((l) => !d.sent.has(l.id)).length : 0;

  return (
    <TabScroll refreshing={data.loading && !!d} onRefresh={data.reload}>
      <PageHeader kicker={`LEADS · ${trades}`} title={d ? (open ? `${open} open for you` : "No new leads") : " "} />
      {!d ? (
        data.loading ? <Loading /> : <Card flat><EmptyRow text="Couldn't load leads. Pull to retry." /></Card>
      ) : d.leads.length === 0 ? (
        <Card flat><EmptyRow text="Nothing open in your trades right now. New requests show up here and as a notification." /></Card>
      ) : (
        <View style={{ gap: 11 }}>
          {d.leads.map((l) => (
            <LeadCard key={l.id} lead={l} sent={d.sent.has(l.id)} onBid={() => navigation.navigate("LeadDetail", { lead: l })} />
          ))}
        </View>
      )}
    </TabScroll>
  );
}
