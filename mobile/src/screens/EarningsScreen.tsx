import React from "react";
import { Text, View } from "react-native";
import { useAppData } from "../context/AppData";
import { useLoad } from "../hooks/useLoad";
import { buildLedger } from "../services/contractorService";
import { getMyReferralJobs } from "../services/jobService";
import { getStreetAddresses } from "../services/propertyService";
import { PlanCard } from "../components/PlanCard";
import { Card, EmptyRow, Kicker, Loading, PageHeader, TabScroll } from "../components/ui";
import { family, type, v3 } from "../theme";

function dollars(cents: number, decimals = 0): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** The line under the ledger — the fee rule, and what Pro saves or would save. */
export function feeNote(pro: boolean, feeTotalCents: number, freeFeeCents: number): string {
  if (pro) {
    return freeFeeCents > 0
      ? `Referral fees are waived on Contractor Pro. On Contractor Free this month would have cost ${dollars(freeFeeCents, 2)}.`
      : "Referral fees are waived on Contractor Pro.";
  }
  return feeTotalCents > 0
    ? "3% of each winning bid, $20 minimum per job. On Contractor Pro this month would be $0."
    : "3% of each winning bid, $20 minimum per job. Contractor Pro has no referral fees.";
}

export default function EarningsScreen() {
  const app = useAppData();
  const data = useLoad(async () => {
    const jobs = await getMyReferralJobs();
    const streets = await getStreetAddresses(jobs.map((j) => j.propertyId)).catch(() => ({} as Record<string, string>));
    return { jobs, streets };
  }, "earnings");

  const ledger = data.data ? buildLedger(data.data.jobs, app.tier, data.data.streets) : null;
  const n = ledger?.rows.length ?? 0;

  return (
    <TabScroll refreshing={data.loading && !!data.data} onRefresh={() => { data.reload(); app.refreshPlan(); }}>
      <PageHeader
        kicker={`EARNINGS · ${ledger?.month ?? new Date().toLocaleDateString("en-US", { month: "long" }).toUpperCase()}`}
        title={!ledger ? " " : n ? `${dollars(ledger.totalCents)} from ${n} ${n === 1 ? "job" : "jobs"}` : "No winning bids yet"}
      />

      <Card>
        {!ledger ? (
          data.loading ? <Loading /> : <EmptyRow text="Couldn't load earnings. Pull to retry." />
        ) : n === 0 ? (
          <EmptyRow text="Verified jobs you win through HomeGentic this month show up here." />
        ) : (
          ledger.rows.map((r) => (
            <View key={r.id} style={{ paddingVertical: 15, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: v3.lineSoft, flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.rowTitle, { fontSize: 14 }]}>{r.label}</Text>
                <Text style={[type.meta, { fontSize: 11, lineHeight: 15.4, marginTop: 5 }]}>{r.feeLabel}</Text>
              </View>
              <Text style={{ fontFamily: family.displayBold, fontSize: 16, letterSpacing: -0.48, color: v3.ink }}>{dollars(r.amountCents)}</Text>
            </View>
          ))
        )}
        {ledger && (
          <View style={{ paddingVertical: 15, paddingHorizontal: 18, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, backgroundColor: v3.field }}>
            <Kicker style={{ letterSpacing: 1.08 }}>REFERRAL FEES THIS MONTH</Kicker>
            <Text style={{ fontFamily: family.displayBold, fontSize: 15, color: v3.ink }}>{dollars(ledger.feeTotalCents, 2)}</Text>
          </View>
        )}
      </Card>
      {ledger && (
        <Text style={{ fontFamily: family.body, fontSize: 11.5, lineHeight: 17.8, color: v3.muted, marginTop: 10, marginHorizontal: 2 }}>
          {feeNote(app.pro, ledger.feeTotalCents, ledger.freeFeeCents)}
        </Text>
      )}

      {/* Upgrades hand off to homegentic.app (UpgradeScreen → openUpgradePage); nothing is sold in the app. */}
      <View style={{ marginTop: 14 }}>
        <PlanCard />
      </View>
    </TabScroll>
  );
}
