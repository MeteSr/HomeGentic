import React from "react";
import { Alert, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAppData } from "../../context/AppData";
import { useLoad } from "../../hooks/useLoad";
import { getJobs, Job } from "../../services/jobService";
import { getAtRisk, AtRiskItem, MAINTENANCE_GAP_MAX_DECAY } from "../../services/scoreService";
import {
  buildUpkeep, completeScheduleEntry, getRecurringServices, getSchedule, logVisit, UpkeepItem,
} from "../../services/upkeepService";
import { AddRow, Callout, Card, Chip, chipTone, EmptyRow, Kicker, PageHeader, Row, TabScroll } from "../../components/ui";
import { NoProperty } from "./NoProperty";
import { family, type, v3 } from "../../theme";

/** "HVAC warranty expires in 12 days (−2 pts) and 1 task is overdue (−1 pt)." */
export function atRiskSentence(risks: AtRiskItem[], overdue: number): string | null {
  const parts = risks.slice(0, 2).map((r) =>
    `${r.label} in ${r.daysRemaining} ${r.daysRemaining === 1 ? "day" : "days"} (−${r.pts} ${r.pts === 1 ? "pt" : "pts"})`,
  );
  if (overdue > 0) {
    const pts = Math.min(overdue, MAINTENANCE_GAP_MAX_DECAY);
    parts.push(`${overdue} ${overdue === 1 ? "task is" : "tasks are"} overdue (−${pts} ${pts === 1 ? "pt" : "pts"})`);
  }
  if (!parts.length) return null;
  const s = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

const TONE = { red: chipTone.red, blue: chipTone.blue, muted: chipTone.muted } as const;

export default function UpkeepScreen() {
  const app = useAppData();
  const navigation = useNavigation<any>();
  const prop = app.activeProperty;

  const data = useLoad(async () => {
    if (!prop) return null;
    const [services, schedule, jobs] = await Promise.all([
      getRecurringServices(prop.id).catch(() => null),
      getSchedule(prop.id).catch(() => null),
      getJobs(prop.id).catch(() => [] as Job[]),
    ]);
    const items = buildUpkeep(services ?? [], schedule ?? []);
    return { items, failed: services == null && schedule == null, jobs };
  }, prop?.id ?? "");

  if (app.propertiesLoaded && !prop) return <TabScroll><NoProperty /></TabScroll>;

  function act(item: UpkeepItem) {
    Alert.alert(item.label, item.meta, [
      { text: "Cancel", style: "cancel" },
      {
        text: item.kind === "recurring" ? "Log today's visit" : "Mark done",
        onPress: async () => {
          try {
            if (item.kind === "recurring") await logVisit(item.id);
            else await completeScheduleEntry(item.id);
            await data.reload();
          } catch (e: any) {
            Alert.alert("Couldn't save that", e?.message ?? "Try again in a moment.");
          }
        },
      },
    ]);
  }

  const items   = data.data?.items ?? [];
  const overdue = items.filter((i) => i.kind === "scheduled" && i.overdue).length;
  const risk    = data.data ? atRiskSentence(getAtRisk(data.data.jobs, Date.now()), overdue) : null;

  return (
    <TabScroll refreshing={data.loading && !!data.data} onRefresh={data.reload}>
      <PageHeader kicker="MAINTENANCE" title="What's coming up" />

      <Card>
        {!data.data ? (
          <EmptyRow text={data.loading ? "Loading…" : "Couldn't load your schedule."} />
        ) : data.data.failed ? (
          <EmptyRow text="Couldn't load your schedule." />
        ) : items.length === 0 ? (
          <EmptyRow text="Nothing scheduled. Add a recurring service, or plan system work on homegentic.app." />
        ) : (
          items.map((it) => {
            const tone = TONE[it.tone];
            return (
              <Row key={it.key} onPress={() => act(it)} style={{ alignItems: "flex-start", gap: 14 }} accessibilityLabel={`${it.label}, ${it.due}`}>
                <Text style={{ width: 52, fontFamily: family.monoMedium, fontSize: 10, lineHeight: 14, letterSpacing: 0.6, color: v3.muted, paddingTop: 2 }}>{it.date}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={type.rowTitle}>{it.label}</Text>
                  <Text style={{ fontFamily: family.body, fontSize: 11.5, lineHeight: 16.7, color: v3.muted, marginTop: 5 }}>{it.meta}</Text>
                </View>
                <Chip label={it.due} color={tone.color} bg={tone.bg} />
              </Row>
            );
          })
        )}
        {prop && <AddRow label="Add a recurring service" onPress={() => navigation.navigate("AddRecurring", { propertyId: prop.id })} />}
      </Card>

      {risk && (
        <Callout style={{ borderRadius: 20, padding: 18, marginTop: 14 }}>
          <Kicker color={v3.ink} style={{ letterSpacing: 1.08 }}>SCORE AT RISK</Kicker>
          <Text style={{ fontFamily: family.body, fontSize: 13, lineHeight: 20.2, color: v3.ink, marginTop: 10 }}>{risk}</Text>
        </Callout>
      )}
    </TabScroll>
  );
}
