/**
 * Landing screens for push-notification deep links whose target depends on
 * data or role. Each looks the item up, then replaces itself with the screen
 * the person actually needs (or goes back to the tabs), so Back returns to
 * where they were.
 *
 *   jobs/<id>  → Sign job when the job is waiting on the signed-in user's
 *                signature, else the Jobs tab (homeowner) or Sign tab
 *                (contractor). One route for both roles: the relay sends the
 *                same path to homeowners and contractors.
 *   leads/<id> → the lead's detail, else the lead feed.
 */
import React, { useEffect } from "react";
import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useAppData } from "../context/AppData";
import { getJobsPendingMySignature } from "../services/jobService";
import { getLeads } from "../services/contractorService";
import { serviceTypeLabel } from "@homegentic/shared/serviceTypes";
import { Loading } from "../components/ui";
import { v3 } from "../theme";

function Holding() {
  return <View style={{ flex: 1, backgroundColor: v3.bg, justifyContent: "center" }}><Loading /></View>;
}

export function JobLinkScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "JobLink">) {
  const app = useAppData();
  const jobId = route.params?.jobId;

  useEffect(() => {
    let live = true;
    const fallback = () => navigation.popTo("Tabs", app.contractor ? { screen: "Sign" } : { screen: "Jobs" });
    (async () => {
      const jobs = jobId ? await getJobsPendingMySignature().catch(() => []) : [];
      if (!live) return;
      const job = jobs.find((j) => j.id === jobId);
      const mine = job && (app.contractor ? !job.contractorSigned : !job.homeownerSigned);
      if (!job || !mine) { fallback(); return; }
      const role = app.contractor ? "contractor" : "homeowner";
      navigation.replace("SignJob", {
        currentRole: role,
        job: {
          id:              job.id,
          serviceType:     serviceTypeLabel(job.serviceType),
          propertyAddress: app.properties.find((p) => p.id === job.propertyId)?.address ?? (app.contractor ? "Client property" : ""),
          amountCents:     job.amountCents,
          completedDate:   job.completedDate,
          awaitingRole:    role,
        },
      });
    })();
    return () => { live = false; };
    // Run once per link; properties only fill in the address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return <Holding />;
}

export function LeadLinkScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, "LeadLink">) {
  const app = useAppData();
  const leadId = route.params?.leadId;

  useEffect(() => {
    let live = true;
    (async () => {
      if (!app.contractor) { navigation.popTo("Tabs"); return; }
      const leads = leadId ? await getLeads().catch(() => []) : [];
      if (!live) return;
      const lead = leads.find((l) => l.id === leadId);
      if (lead) navigation.replace("LeadDetail", { lead });
      else navigation.popTo("Tabs", { screen: "Leads" });
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  return <Holding />;
}
