import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ChatStackParamList } from "../navigation/ChatStack";
import { getJobs, Job } from "../services/jobService";
import { colors, fonts, spacing, borderWidth } from "../theme";

type Nav = NativeStackNavigationProp<ChatStackParamList, "PropertyDetail">;

type Props = NativeStackScreenProps<ChatStackParamList, "PropertyDetail">;

function JobRow({ job, onCameraPress }: { job: Job; onCameraPress: () => void }) {
  const amount = (job.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const isVerified = job.status === "verified";
  return (
    <View style={styles.jobRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.jobService}>{job.serviceType}</Text>
        <Text style={styles.jobDesc} numberOfLines={1}>{job.description}</Text>
        <Text style={styles.jobMeta}>{job.completedDate} · {amount}{job.isDiy ? " · DIY" : ""}</Text>
      </View>
      <TouchableOpacity
        onPress={onCameraPress}
        accessibilityRole="button"
        accessibilityLabel={`Add photo to ${job.serviceType} job`}
        style={styles.cameraBtn}
      >
        <Text style={styles.cameraBtnText}>⊕</Text>
      </TouchableOpacity>
      <View style={[styles.statusDot, { backgroundColor: isVerified ? colors.sage : colors.inkLight }]} />
    </View>
  );
}

export default function PropertyDetailScreen({ route }: Props) {
  const { property } = route.params;
  const navigation   = useNavigation<Nav>();
  const [jobs, setJobs]     = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  // Re-fetch on every focus so list refreshes after returning from LogJobScreen
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      getJobs(property.id)
        .then(setJobs)
        .finally(() => setLoading(false));
    }, [property.id])
  );

  function openUpgrade() {
    Linking.openURL("https://homegentic.app/pricing");
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
            <Text style={styles.scoreLabel}>HomeGentic Score</Text>
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
        <TouchableOpacity
          onPress={() => navigation.navigate("LogJob", {
            propertyId:      property.id,
            propertyAddress: property.address,
          })}
          accessibilityRole="button"
          accessibilityLabel="Log a job"
        >
          <Text style={styles.logJobBtn}>+ LOG JOB</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.rust} />
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j) => j.id}
          renderItem={({ item }) => (
              <JobRow
                job={item}
                onCameraPress={() => navigation.navigate("PhotoUpload", {
                  jobId:          item.id,
                  propertyId:     property.id,
                  jobServiceType: item.serviceType,
                })}
              />)}
          contentContainerStyle={{ paddingBottom: 0 }}
          ListEmptyComponent={
            <Text style={styles.empty}>No jobs logged yet.</Text>
          }
          ListFooterComponent={
            <>
              {/* Quote requests entry point (15.8.2) */}
              <TouchableOpacity
                style={styles.quotesRow}
                onPress={() => navigation.navigate("MyQuotes", {
                  propertyId:      property.id,
                  propertyAddress: property.address,
                })}
                accessibilityRole="button"
                accessibilityLabel="View quote requests"
              >
                <Text style={styles.sectionLabel}>QUOTE REQUESTS</Text>
                <Text style={styles.quotesArrow}>REQUEST QUOTE  ›</Text>
              </TouchableOpacity>

              {/* Utility bills entry point (Epic #49) */}
              <TouchableOpacity
                style={styles.quotesRow}
                onPress={() => navigation.navigate("BillUpload", {
                  propertyId:      property.id,
                  propertyAddress: property.address,
                })}
                accessibilityRole="button"
                accessibilityLabel="Upload utility bill"
              >
                <Text style={styles.sectionLabel}>UTILITY BILLS</Text>
                <Text style={styles.quotesArrow}>UPLOAD BILL  ›</Text>
              </TouchableOpacity>

              {/* Document OCR entry point (Issue #51) */}
              <TouchableOpacity
                style={styles.quotesRow}
                onPress={() => navigation.navigate("ScanDocument", {
                  propertyId:      property.id,
                  propertyAddress: property.address,
                })}
                accessibilityRole="button"
                accessibilityLabel="Scan appliance manual or warranty"
              >
                <Text style={styles.sectionLabel}>DOCUMENTS</Text>
                <Text style={styles.quotesArrow}>SCAN DOCUMENT  ›</Text>
              </TouchableOpacity>
            </>
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
    flexDirection:     "row",
    justifyContent:    "space-between",
    alignItems:        "center",
    padding:           spacing.md,
    borderBottomWidth: borderWidth,
    borderBottomColor: colors.rule,
  },
  sectionLabel: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 2, color: colors.inkLight },
  logJobBtn:    { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: colors.rust },
  quotesRow: {
    flexDirection:     "row",
    justifyContent:    "space-between",
    alignItems:        "center",
    padding:           spacing.md,
    borderTopWidth:    borderWidth,
    borderBottomWidth: borderWidth,
    borderColor:       colors.rule,
    marginTop:         spacing.sm,
  },
  quotesArrow: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.rust },
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
  cameraBtn:     { padding: spacing.sm, marginLeft: spacing.sm },
  cameraBtnText: { fontFamily: fonts.mono, fontSize: 16, color: colors.inkLight },
  statusDot:     { width: 8, height: 8, marginLeft: spacing.sm },
  empty:      { fontFamily: fonts.sans, fontSize: 14, color: colors.inkLight, textAlign: "center", marginTop: spacing.xl },
});
