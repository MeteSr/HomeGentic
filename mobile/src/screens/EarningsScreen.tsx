import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  StyleSheet,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { EarningsStackParamList } from "../navigation/EarningsStack";
import { getEarningsSummary, formatEarnings, EarningsSummary } from "../services/contractorService";
import { colors, fonts, spacing, borderWidth } from "../theme";

type Nav = NativeStackNavigationProp<EarningsStackParamList, "Earnings">;

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function EarningsScreen() {
  const navigation = useNavigation<Nav>();
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEarningsSummary()
      .then(setSummary)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.rust} /></View>;
  }

  if (!summary) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.sectionLabel}>EARNINGS</Text>
      </View>

      <View style={styles.statsRow}>
        <StatBlock label="TOTAL EARNED"    value={formatEarnings(summary.totalEarnedCents)} />
        <View style={styles.dividerV} />
        <StatBlock label="VERIFIED JOBS"   value={String(summary.verifiedJobCount)} />
        <View style={styles.dividerV} />
        <TouchableOpacity
          onPress={() => navigation.navigate("PendingSignatures")}
          accessibilityRole="button"
          accessibilityLabel="View pending signatures"
        >
          <StatBlock label="PENDING" value={String(summary.pendingJobCount)} />
        </TouchableOpacity>
      </View>

      <View style={styles.dividerH} />

      {/* Upgrade CTA (15.5.6) */}
      <TouchableOpacity
        style={styles.upgradeBanner}
        onPress={() => Linking.openURL("https://homegentic.app/pricing")}
        accessibilityRole="button"
        accessibilityLabel="Upgrade to ContractorPro"
      >
        <Text style={styles.upgradeBannerText}>
          Upgrade to ContractorPro — unlimited leads & priority listing ›
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  center:    { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper },
  header: {
    padding: spacing.md,
    borderBottomWidth: borderWidth,
    borderBottomColor: colors.rule,
  },
  sectionLabel: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 2, color: colors.inkLight },
  statsRow: {
    flexDirection: "row",
    padding: spacing.lg,
  },
  statBlock:  { flex: 1, alignItems: "center" },
  statValue:  { fontFamily: fonts.serifBlack, fontSize: 32, color: colors.ink, lineHeight: 38 },
  statLabel:  { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.5, color: colors.inkLight, marginTop: 4 },
  dividerV:   { width: borderWidth, backgroundColor: colors.rule, marginHorizontal: spacing.sm },
  dividerH:   { height: borderWidth, backgroundColor: colors.rule },
  upgradeBanner: {
    backgroundColor: colors.ink,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  upgradeBannerText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.paper,
    textAlign: "center",
  },
});
