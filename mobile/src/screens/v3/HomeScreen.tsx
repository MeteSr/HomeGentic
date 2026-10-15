import React, { useCallback, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAppData } from "../../context/AppData";
import { useLoad } from "../../hooks/useLoad";
import { getJobs } from "../../services/jobService";
import { dismissNotifications, getOwnerNotifications, initials, OwnerNotification } from "../../services/propertyService";
import { computeScore, scoreHint } from "../../services/scoreService";
import {
  FREQUENCY_LABEL, getRecurringServices, getSchedule, isOverdue, logVisit, nextDue,
  RecurringService, SERVICE_ABBR, SERVICE_LABEL,
} from "../../services/upkeepService";
import { Icon } from "../../components/Icon";
import { PlanCard } from "../../components/PlanCard";
import { AddRow, Card, Chip, EmptyRow, IconTile, Kicker, Pill, Row, SectionLabel, TabScroll } from "../../components/ui";
import { NoProperty } from "./NoProperty";
import { family, type, v3 } from "../../theme";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "GOOD MORNING" : h < 18 ? "GOOD AFTERNOON" : "GOOD EVENING";
}

/** "AUG 21 · IN 4 DAYS", "AUG 27 · RECURRING", "AUG 12 · 3 DAYS LATE". */
export function dueLine(svc: RecurringService, now = Date.now()): { text: string; soon: boolean } {
  const due  = nextDue(svc);
  const d    = new Date(due);
  const date = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const days = Math.round((due - today.getTime()) / 86_400_000);
  if (days < 0)  return { text: `${date} · ${-days} ${days === -1 ? "DAY" : "DAYS"} LATE`, soon: true };
  if (FREQUENCY_LABEL[svc.frequency].days <= 14) return { text: `${date} · RECURRING`, soon: false };
  if (days === 0) return { text: `${date} · TODAY`, soon: true };
  return { text: `${date} · IN ${days} ${days === 1 ? "DAY" : "DAYS"}`, soon: days <= 7 };
}

/** "Marcus Dean moved gutter cleaning to Aug 21. Ruth Ellis …" — newest two. */
export function whileYouWereOut(unseen: OwnerNotification[]): string {
  const lines = unseen.slice(0, 2).map((n) => {
    const d = n.description.trim().replace(/\.$/, "");
    return `${n.managerName} ${d.charAt(0).toLowerCase()}${d.slice(1)}.`;
  });
  const more = unseen.length - 2;
  return lines.join(" ") + (more > 0 ? ` And ${more} more.` : "");
}

export default function HomeScreen() {
  const app = useAppData();
  const navigation = useNavigation<any>();
  const prop = app.activeProperty;
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const data = useLoad(async () => {
    if (!prop) return null;
    const [jobs, services, schedule, notes] = await Promise.all([
      getJobs(prop.id).catch(() => []),
      getRecurringServices(prop.id).catch(() => null),
      getSchedule(prop.id).catch(() => []),
      app.pro ? getOwnerNotifications(prop.id).catch(() => []) : Promise.resolve([] as OwnerNotification[]),
    ]);
    const overdue = schedule.filter((e) => isOverdue(e)).length;
    return { jobs, services, overdue, unseen: notes.filter((n) => !n.seen) };
  }, `${prop?.id}:${app.pro}`);

  const markDone = useCallback(async (svc: RecurringService) => {
    setBusy(svc.id);
    try { await logVisit(svc.id); setOpen(null); await data.reload(); } finally { setBusy(null); }
  }, [data]);

  const acknowledge = useCallback(async () => {
    if (!prop) return;
    await dismissNotifications(prop.id).catch(() => {});
    await data.reload();
  }, [prop, data]);

  if (app.propertiesLoaded && !prop) {
    return <TabScroll><NoProperty /></TabScroll>;
  }

  const jobs     = data.data?.jobs ?? [];
  const score    = prop ? computeScore(jobs, prop, Date.now(), data.data?.overdue ?? 0) : 0;
  const verified = jobs.filter((j) => j.verified).length;
  const services = data.data?.services;
  const unseen   = data.data?.unseen ?? [];

  return (
    <TabScroll refreshing={data.loading && !!data.data} onRefresh={() => { data.reload(); app.refreshPlan(); app.refreshUsage(); }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14, paddingTop: 10, paddingBottom: 16, paddingHorizontal: 2 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Kicker>{greeting()}{app.firstName ? `, ${app.firstName.toUpperCase()}` : ""}</Kicker>
          <Pressable
            onPress={app.openProps}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 9 }}
            accessibilityRole="button"
            accessibilityLabel={`${prop?.street ?? "Property"}, switch property`}
          >
            <Text style={[type.pageTitle, { flexShrink: 1 }]}>{prop?.street ?? " "}</Text>
            <Icon name="chevronDown" size={18} color={v3.muted} strokeWidth={2.4} />
          </Pressable>
          <Text style={[type.meta, { marginTop: 7 }]}>{prop ? `${prop.city}, ${prop.state} ${prop.zipCode}`.toUpperCase() : ""}</Text>
        </View>
        <View style={{ width: 38, height: 38, borderRadius: 100, backgroundColor: v3.blueTint, borderWidth: 1, borderColor: v3.blueLine, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: family.displayBold, fontSize: 13, color: v3.blue }}>{initials(app.displayName)}</Text>
        </View>
      </View>

      {/* Score */}
      <Card style={{ padding: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 14 }}>
          <View>
            <Kicker>HOMEGENTIC SCORE</Kicker>
            <Text style={{ fontFamily: family.display, fontSize: 44, lineHeight: 46, letterSpacing: -1.98, color: v3.ink, marginTop: 11 }}>
              {data.data ? score : "–"}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Kicker style={{ letterSpacing: 1.08 }}>VERIFIED JOBS</Kicker>
            <Text style={{ fontFamily: family.displayBold, fontSize: 19, lineHeight: 21, letterSpacing: -0.38, color: v3.ink, marginTop: 10 }}>
              {data.data ? verified : "–"}
            </Text>
          </View>
        </View>
        <View style={{ height: 6, borderRadius: 100, backgroundColor: v3.line, marginTop: 16, overflow: "hidden" }}>
          <View style={{ height: "100%", width: `${score}%`, backgroundColor: v3.blue, borderRadius: 100 }} />
        </View>
        <Text style={[type.body, { marginTop: 12 }]}>
          {data.data && prop ? scoreHint(jobs, prop, Date.now(), data.data.overdue) : data.error ? "Couldn't load your record. Pull to retry." : "Loading your record…"}
        </Text>
      </Card>

      {/* Activity on your behalf (Pro shared access) */}
      {unseen.length > 0 && (
        <View style={{ backgroundColor: v3.blue, borderRadius: 22, padding: 20, marginTop: 14 }}>
          <Kicker color={v3.paperDim}>WHILE YOU WERE OUT</Kicker>
          <Text style={{ fontFamily: family.body, fontSize: 14, lineHeight: 21.7, color: v3.paper, marginTop: 11 }}>{whileYouWereOut(unseen)}</Text>
          <View style={{ flexDirection: "row", gap: 9, marginTop: 16 }}>
            <Pill label="Looks right" variant="paper" small onPress={acknowledge} />
            <Pill label="See activity" variant="outlineOnDark" small onPress={() => navigation.navigate("People")} />
          </View>
        </View>
      )}

      {/* Recurring services */}
      <SectionLabel>RECURRING SERVICES</SectionLabel>
      <Card>
        {services == null ? (
          <EmptyRow text={data.loading ? "Loading…" : "Couldn't load recurring services."} />
        ) : services.filter((s) => s.status === "Active").length === 0 ? (
          <EmptyRow text="No recurring services yet. Add lawn care, pest control or gutter cleaning to track each visit." />
        ) : (
          services.filter((s) => s.status === "Active").map((svc) => {
            const due = dueLine(svc);
            const isOpen = open === svc.id;
            return (
              <View key={svc.id} style={{ borderBottomWidth: 1, borderBottomColor: v3.lineSoft }}>
                <Row
                  last
                  onPress={() => setOpen(isOpen ? null : svc.id)}
                  accessibilityLabel={`${SERVICE_LABEL[svc.serviceType]}, ${due.text}`}
                >
                  <IconTile abbr={SERVICE_ABBR[svc.serviceType]} bg={due.soon ? v3.blueTint : v3.lineSoft} color={due.soon ? v3.blue : v3.muted} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={type.rowTitle}>{SERVICE_LABEL[svc.serviceType]}</Text>
                    <Text style={[type.meta, { color: due.soon ? v3.blue : v3.muted, marginTop: 5 }]}>{due.text}</Text>
                  </View>
                  <Chip label={FREQUENCY_LABEL[svc.frequency].chip} border={v3.chipLine} />
                </Row>
                {isOpen && (
                  <View style={{ paddingHorizontal: 18, paddingBottom: 17 }}>
                    <View style={{ backgroundColor: v3.field, borderWidth: 1, borderColor: v3.line, borderRadius: 16, padding: 14 }}>
                      <Text style={[type.body, { lineHeight: 19.4 }]}>
                        {svc.providerName}{svc.notes ? `. ${svc.notes}` : ""}
                        {svc.lastVisit ? ` Last visit ${svc.lastVisit}.` : " No visits logged yet."}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                        <Pill label="Mark done" small loading={busy === svc.id} onPress={() => markDone(svc)} />
                        {svc.providerPhone && (
                          <Pill label="Call provider" variant="outline" small onPress={() => Linking.openURL(`tel:${svc.providerPhone}`)} />
                        )}
                      </View>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
        {prop && <AddRow label="Add a recurring service" onPress={() => navigation.navigate("AddRecurring", { propertyId: prop.id })} />}
      </Card>

      <View style={{ marginTop: 14 }}>
        <PlanCard flat />
      </View>
    </TabScroll>
  );
}

