import React from "react";
import { ScrollView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useLoad } from "../hooks/useLoad";
import { getJobs } from "../services/jobService";
import { serviceTypeLabel } from "../services/serviceTypes";
import { Card, Chip, chipTone, EmptyRow, Loading, Pill } from "../components/ui";
import { type, v3 } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "PropertyDetail">;

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** Job history for a property, with a photo button on each job. */
export default function PropertyDetailScreen({ route, navigation }: Props) {
  const { property } = route.params;
  // Re-fetches on focus so the list refreshes after logging a job or adding photos.
  const jobs = useLoad(() => getJobs(property.id), property.id);
  const list = [...(jobs.data ?? [])].sort((a, b) => b.completedDate.localeCompare(a.completedDate));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: v3.bg }} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
      <Pill
        label="Log a job"
        icon="plus"
        block
        onPress={() => navigation.navigate("LogJob", { propertyId: property.id, propertyAddress: property.address })}
      />
      <Card style={{ marginTop: 14 }}>
        {jobs.loading && !jobs.data ? (
          <Loading />
        ) : list.length === 0 ? (
          <EmptyRow text={jobs.error ? "Couldn't load jobs." : "No jobs logged yet."} />
        ) : (
          list.map((job, i) => {
            const tone = job.verified ? chipTone.blue : chipTone.muted;
            return (
              <View key={job.id} style={{ paddingVertical: 15, paddingHorizontal: 18, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: v3.lineSoft }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={type.rowTitle}>{serviceTypeLabel(job.serviceType)}</Text>
                    <Text style={[type.body, { marginTop: 3 }]} numberOfLines={2}>{job.description}</Text>
                    <Text style={[type.meta, { fontSize: 11, marginTop: 5 }]}>
                      {[job.completedDate, money(job.amountCents), job.isDiy ? "DIY" : job.contractorName?.toUpperCase()].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <Chip label={job.verified ? "VERIFIED" : "UNSIGNED"} color={tone.color} bg={tone.bg} />
                </View>
                <Pill
                  label="Add photo"
                  variant="outline"
                  small
                  style={{ marginTop: 12 }}
                  accessibilityLabel={`Add photo to ${serviceTypeLabel(job.serviceType)} job`}
                  onPress={() => navigation.navigate("PhotoUpload", { jobId: job.id, propertyId: property.id, jobServiceType: serviceTypeLabel(job.serviceType) })}
                />
              </View>
            );
          })
        )}
      </Card>
    </ScrollView>
  );
}
