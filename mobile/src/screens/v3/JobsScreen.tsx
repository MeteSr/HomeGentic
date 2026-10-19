import React from "react";
import { Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAppData } from "../../context/AppData";
import { useLoad } from "../../hooks/useLoad";
import { getJobs, getJobsPendingMySignature, Job } from "../../services/jobService";
import { Bid, getBids, getMyQuoteRequests, isOpenRequest, QuoteRequest } from "../../services/quoteService";
import { initials } from "../../services/propertyService";
import { serviceTypeLabel } from "@homegentic/shared/serviceTypes";
import { Icon } from "../../components/Icon";
import { Card, EmptyRow, IconTile, Kicker, PageHeader, Pill, Row, SectionLabel, TabScroll } from "../../components/ui";
import { NoProperty } from "./NoProperty";
import { family, type, v3 } from "../../theme";

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** "CLOSES FRI" within a week, else "CLOSES AUG 30". */
export function closesLabel(closeAt: number | null, now = Date.now()): string | null {
  if (!closeAt || closeAt < now) return null;
  const d = new Date(closeAt);
  if (closeAt - now < 6 * 86_400_000) return `CLOSES ${DAYS[d.getDay()]}`;
  return `CLOSES ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}`;
}

export interface ContractorSummary { name: string; meta: string; count: number }

/** Contractors from the job history, most jobs first: "GUTTERS, ROOFING · 12 JOBS". */
export function summariseContractors(jobs: Job[]): ContractorSummary[] {
  const by = new Map<string, { types: Set<string>; count: number }>();
  for (const j of jobs) {
    if (j.isDiy || !j.contractorName) continue;
    const e = by.get(j.contractorName) ?? { types: new Set<string>(), count: 0 };
    e.types.add(serviceTypeLabel(j.serviceType).toUpperCase());
    e.count++;
    by.set(j.contractorName, e);
  }
  return [...by.entries()]
    .map(([name, e]) => ({ name, count: e.count, meta: `${[...e.types].slice(0, 2).join(", ")} · ${e.count} ${e.count === 1 ? "JOB" : "JOBS"}` }))
    .sort((a, b) => b.count - a.count);
}

export default function JobsScreen() {
  const app = useAppData();
  const navigation = useNavigation<any>();
  const prop = app.activeProperty;

  const data = useLoad(async () => {
    if (!prop) return null;
    const [jobs, requests, toSign] = await Promise.all([
      getJobs(prop.id).catch(() => [] as Job[]),
      getMyQuoteRequests(prop.id).catch(() => [] as QuoteRequest[]),
      getJobsPendingMySignature().catch(() => [] as Job[]),
    ]);
    const mine = requests.filter((r) => r.propertyId === prop.id);
    const open = mine.filter(isOpenRequest);
    // The open request with the most bids gets the featured card.
    const withBids = await Promise.all(open.map(async (r) => ({ r, bids: await getBids(r.id).catch(() => [] as Bid[]) })));
    const featured = withBids.filter((x) => x.bids.length > 0).sort((a, b) => b.bids.length - a.bids.length)[0] ?? null;
    return {
      jobs,
      open,
      featured,
      toSign: toSign.filter((j) => j.propertyId === prop.id && !j.homeownerSigned),
    };
  }, prop?.id ?? "");

  if (app.propertiesLoaded && !prop) return <TabScroll><NoProperty /></TabScroll>;

  const d = data.data;
  const addr = prop ? { propertyId: prop.id, propertyAddress: prop.address } : null;
  const title = d ? `${d.open.length} open, ${d.jobs.length} logged` : " ";
  const sign = d?.toSign[0];
  const contractors = d ? summariseContractors(d.jobs) : [];
  const openLimit = app.limits.openQuotes;

  return (
    <TabScroll refreshing={data.loading && !!d} onRefresh={data.reload}>
      <PageHeader kicker="JOBS" title={title} />

      {d?.featured && (
        <Card style={{ padding: 20, borderWidth: 2, borderColor: v3.blue, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Kicker color={v3.blue} style={{ letterSpacing: 1.08 }}>
              {d.featured.bids.length} {d.featured.bids.length === 1 ? "BID" : "BIDS"}
            </Kicker>
            {closesLabel(d.featured.r.closeAt) && <Kicker style={{ letterSpacing: 1.08 }}>{closesLabel(d.featured.r.closeAt)}</Kicker>}
          </View>
          <Text style={{ fontFamily: family.displayBold, fontSize: 18, lineHeight: 21.6, letterSpacing: -0.36, color: v3.ink, marginTop: 11 }} numberOfLines={2}>
            {d.featured.r.description || serviceTypeLabel(d.featured.r.serviceType)}
          </Text>
          <View style={{ gap: 8, marginTop: 14 }}>
            {d.featured.bids.slice(0, 3).map((b) => (
              <View key={b.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: v3.field, borderWidth: 1, borderColor: v3.line, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: family.bodySemi, fontSize: 13.5, lineHeight: 17.5, color: v3.ink }}>{b.contractorName}</Text>
                  <Text style={[type.meta, { fontSize: 11, lineHeight: 15.4, marginTop: 5 }]}>
                    {b.verified ? "VERIFIED" : "UNVERIFIED"} · {b.jobsCompleted} {b.jobsCompleted === 1 ? "JOB" : "JOBS"} · {b.timelineDays} DAYS
                  </Text>
                </View>
                <Text style={{ fontFamily: family.displayBold, fontSize: 16, letterSpacing: -0.48, color: v3.ink }}>{money(b.amountCents)}</Text>
              </View>
            ))}
          </View>
          <Pill
            label="Compare bids"
            block
            style={{ marginTop: 14 }}
            onPress={() => navigation.navigate("CompareBids", { requestId: d.featured!.r.id, title: d.featured!.r.description || serviceTypeLabel(d.featured!.r.serviceType) })}
          />
        </Card>
      )}

      {sign && (
        <View style={{ backgroundColor: v3.yellowTint, borderWidth: 1, borderColor: v3.yellow, borderRadius: 22, padding: 20, marginBottom: 12 }}>
          <Kicker color={v3.ink} style={{ letterSpacing: 1.08 }}>
            {d!.toSign.length > 1 ? `${d!.toSign.length} WAITING ON YOUR SIGNATURE` : "WAITING ON YOUR SIGNATURE"}
          </Kicker>
          <Text style={[type.cardTitle, { marginTop: 11 }]}>
            {serviceTypeLabel(sign.serviceType)}{sign.contractorName ? ` · ${sign.contractorName}` : ""}
          </Text>
          <Text style={[type.body, { marginTop: 7 }]}>
            {sign.contractorSigned ? `${sign.contractorName ?? "The contractor"} signed` : "Completed"}
            {sign.completedDate ? ` on ${sign.completedDate}` : ""}, {money(sign.amountCents)}. Your signature makes it a verified job.
          </Text>
          <Pill
            label="Sign job"
            variant="ink"
            style={{ marginTop: 14 }}
            onPress={() => navigation.navigate("SignJob", {
              currentRole: "homeowner",
              job: {
                id: sign.id, serviceType: serviceTypeLabel(sign.serviceType), propertyAddress: prop?.address ?? "",
                amountCents: sign.amountCents, completedDate: sign.completedDate, awaitingRole: "homeowner",
              },
            })}
          />
        </View>
      )}

      <Card
        flat
        onPress={() => addr && navigation.navigate(d && d.open.length >= openLimit ? "MyQuotes" : "QuoteRequest", addr)}
        accessibilityLabel="Request a quote"
        style={{ paddingVertical: 16, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 13 }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={type.rowTitle}>Request a quote</Text>
          <Text style={[type.meta, { marginTop: 5 }]}>
            {openLimit === Infinity
              ? "UNLIMITED OPEN REQUESTS ON PRO"
              : `${d?.open.length ?? 0} OF ${openLimit} OPEN REQUESTS ON FREE`}
          </Text>
        </View>
        <Icon name="plus" size={16} color={v3.blue} strokeWidth={2.4} />
      </Card>

      <Row
        style={{ borderBottomWidth: 0, paddingHorizontal: 2, paddingVertical: 10 }}
        onPress={() => addr && navigation.navigate("MyQuotes", addr)}
        accessibilityLabel="All quote requests"
      >
        <Text style={{ fontFamily: family.bodySemi, fontSize: 13, color: v3.blue }}>All quote requests</Text>
      </Row>

      <SectionLabel>YOUR CONTRACTORS</SectionLabel>
      <Card flat>
        {!d ? (
          <EmptyRow text={data.loading ? "Loading…" : "Couldn't load jobs."} />
        ) : contractors.length === 0 ? (
          <EmptyRow text="Contractors you hire show up here once their jobs are logged." />
        ) : (
          contractors.map((c, i) => (
            <Row key={c.name} last={i === contractors.length - 1} style={{ paddingVertical: 14 }}>
              <IconTile abbr={initials(c.name)} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.rowTitle, { fontSize: 14 }]}>{c.name}</Text>
                <Text style={[type.meta, { marginTop: 5 }]}>{c.meta}</Text>
              </View>
            </Row>
          ))
        )}
      </Card>

      {prop && (
        <Pill
          label="Job history and photos"
          variant="outline"
          block
          style={{ marginTop: 14 }}
          onPress={() => navigation.navigate("PropertyDetail", { property: prop })}
        />
      )}
    </TabScroll>
  );
}
