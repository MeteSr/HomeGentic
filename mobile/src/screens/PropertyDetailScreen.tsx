import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ChatStackParamList } from "../navigation/ChatStack";
import { getJobs, Job } from "../services/jobService";
import { colors, fonts, spacing, borderWidth } from "../theme";

type Props = NativeStackScreenProps<ChatStackParamList, "PropertyDetail">;

function JobRow({ job }: { job: Job }) {
  const amount = (job.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const isVerified = job.status === "verified";
  return (
    <View style={styles.jobRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.jobService}>{job.serviceType}</Text>
        <Text style={styles.jobDesc} numberOfLines={1}>{job.description}</Text>
        <Text style={styles.jobMeta}>{job.completedDate} · {amount}{job.isDiy ? " · DIY" : ""}</Text>
      </View>
      <View style={[styles.statusDot, { backgroundColor: isVerified ? colors.sage : colors.inkLight }]} />
    </View>
  );
}

export default function PropertyDetailScreen({ route }: Props) {
  const { property } = route.params;
  const [jobs, setJobs]     = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getJobs(property.id)
      .then(setJobs)
      .finally(() => setLoading(false));
  }, [property.id]);

  function openUpgrade() {
    Linking.openURL("https://homefax.app/pricing");
  }

  return (
    <View style={styles.container}>
      {/* Score hero */}
      <View style={styles.hero}>
        <Text style={styles.heroAddress}>{property.address}</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreNum}>{property.score}</Text>
          <View style={styles.scoreRight}>
            <Text style={styles.scoreGrade}>{property.scoreGrade}</Text>
            <Text style={styles.scoreLabel}>HomeFax Score</Text>
          </View>
        </View>
      </View>

      {/* Upgrade CTA (15.4.7) */}
      <TouchableOpacity style={styles.upgradeBanner} onPress={openUpgrade}>
        <Text style={styles.upgradeBannerText}>
          Upgrade to Pro — unlock warranty wallet, recurring services & more ›
        </Text>
      </TouchableOpacity>

      {/* Job history (15.4.3) */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>JOB HISTORY</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.rust} />
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j) => j.id}
          renderItem={({ item }) => <JobRow job={item} />}
          contentContainerStyle={{ paddingBottom: spacing.lg }}
          ListEmptyComponent={
            <Text style={styles.empty}>No jobs logged yet.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  hero: {
    padding: spacing.lg,
    borderBottomWidth: borderWidth,
    borderBottomColor: colors.rule,
  },
  heroAddress: { fontFamily: fonts.sans, fontSize: 13, color: colors.inkLight, marginBottom: spacing.sm },
  scoreRow:    { flexDirection: "row", alignItems: "center" },
  scoreNum:    { fontFamily: fonts.serifBlack, fontSize: 64, color: colors.ink, lineHeight: 72 },
  scoreRight:  { marginLeft: spacing.md },
  scoreGrade:  { fontFamily: fonts.serif, fontSize: 32, color: colors.rust, lineHeight: 38 },
  scoreLabel:  { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.5, color: colors.inkLight },
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
  sectionHeader: {
    padding: spacing.md,
    borderBottomWidth: borderWidth,
    borderBottomColor: colors.rule,
  },
  sectionLabel: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 2, color: colors.inkLight },
  jobRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: borderWidth,
    borderBottomColor: colors.rule,
  },
  jobService: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink },
  jobDesc:    { fontFamily: fonts.sans, fontSize: 13, color: colors.inkLight, marginTop: 2 },
  jobMeta:    { fontFamily: fonts.mono, fontSize: 10, color: colors.inkLight, marginTop: 4, letterSpacing: 0.5 },
  statusDot:  { width: 8, height: 8, marginLeft: spacing.md },
  empty:      { fontFamily: fonts.sans, fontSize: 14, color: colors.inkLight, textAlign: "center", marginTop: spacing.xl },
});
