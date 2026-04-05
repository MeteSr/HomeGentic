import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ContractorStackParamList } from "../navigation/ContractorStack";
import {
  signJob,
  signButtonLabel,
  signConfirmationText,
  canSign,
  type SignableJob,
} from "../services/signJobService";
import { colors, fonts, spacing, borderWidth } from "../theme";

// SignJobScreen is mounted from ContractorStack.
// For homeowner signing (15.8.4), add the same screen to ChatStack when needed.
type Props = NativeStackScreenProps<ContractorStackParamList, "SignJob">;

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function SignJobScreen({ route, navigation }: Props) {
  const { job, currentRole } = route.params;
  const [acknowledged, setAcknowledged] = useState(false);
  const [signing,      setSigning]      = useState(false);

  const eligible     = canSign(job, currentRole);
  const buttonLabel  = signButtonLabel(job.awaitingRole);
  const confirmation = signConfirmationText(job);

  const amount = (job.amountCents / 100).toLocaleString("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  });

  async function handleSign() {
    if (!acknowledged) {
      Alert.alert("Acknowledgment required", "Please read and check the confirmation statement before signing.");
      return;
    }

    Alert.alert(
      "Sign job record",
      "Your signature will be recorded on-chain and cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign",
          onPress: async () => {
            setSigning(true);
            try {
              await signJob(job.id);
              Alert.alert(
                "Signed",
                "Your signature has been recorded.",
                [{ text: "OK", onPress: () => navigation.goBack() }],
              );
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Something went wrong";
              Alert.alert("Could not sign", msg);
            } finally {
              setSigning(false);
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {/* Job summary */}
      <View style={styles.card}>
        <Text style={styles.serviceType}>{job.serviceType}</Text>
        <Text style={styles.address} numberOfLines={1}>{job.propertyAddress}</Text>
        <InfoRow label="COMPLETED"  value={job.completedDate} />
        <InfoRow label="AMOUNT"     value={amount} />
        <InfoRow label="AWAITING"   value={job.awaitingRole.toUpperCase()} />
      </View>

      {/* Ineligible notice */}
      {!eligible && (
        <View style={styles.noticeBanner}>
          <Text style={styles.noticeText}>
            This job is awaiting the {job.awaitingRole}'s signature — not yours.
          </Text>
        </View>
      )}

      {eligible && (
        <>
          {/* Legal acknowledgment */}
          <View style={styles.acknowledgmentBox}>
            <Text style={styles.acknowledgmentText}>{confirmation}</Text>
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setAcknowledged((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acknowledged }}
            >
              <View style={[styles.checkbox, acknowledged && styles.checkboxChecked]}>
                {acknowledged && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkLabel}>I confirm the above statement</Text>
            </TouchableOpacity>
          </View>

          {/* Sign button */}
          <TouchableOpacity
            style={[
              styles.signBtn,
              (!acknowledged || signing) && styles.signBtnDisabled,
            ]}
            onPress={handleSign}
            disabled={!acknowledged || signing}
            accessibilityRole="button"
            accessibilityLabel={buttonLabel}
          >
            {signing
              ? <ActivityIndicator color={colors.paper} />
              : <Text style={styles.signBtnText}>{buttonLabel}</Text>}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:   { flex: 1, backgroundColor: colors.paper },
  content:  { padding: spacing.md, paddingBottom: spacing.xxl },

  card: {
    borderWidth:  borderWidth,
    borderColor:  colors.rule,
    padding:      spacing.md,
    marginBottom: spacing.lg,
  },
  serviceType: { fontFamily: fonts.serif, fontSize: 26, color: colors.ink, marginBottom: 4 },
  address:     { fontFamily: fonts.sans, fontSize: 13, color: colors.inkLight, marginBottom: spacing.md },

  infoRow: {
    flexDirection:     "row",
    justifyContent:    "space-between",
    paddingVertical:   6,
    borderTopWidth:    borderWidth,
    borderTopColor:    colors.rule,
  },
  infoLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.inkLight },
  infoValue: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.ink },

  noticeBanner: {
    backgroundColor: "#F0EDE6",
    borderWidth:     borderWidth,
    borderColor:     colors.rule,
    padding:         spacing.md,
    marginBottom:    spacing.lg,
  },
  noticeText: { fontFamily: fonts.sans, fontSize: 14, color: colors.inkLight, textAlign: "center" },

  acknowledgmentBox: {
    borderWidth:  borderWidth,
    borderColor:  colors.rule,
    padding:      spacing.md,
    marginBottom: spacing.lg,
    backgroundColor: "#F9F7F2",
  },
  acknowledgmentText: {
    fontFamily:   fonts.sans,
    fontSize:     13,
    color:        colors.ink,
    lineHeight:   20,
    marginBottom: spacing.md,
  },
  checkRow: {
    flexDirection: "row",
    alignItems:    "center",
  },
  checkbox: {
    width:        20,
    height:       20,
    borderWidth:  borderWidth,
    borderColor:  colors.rule,
    marginRight:  spacing.sm,
    alignItems:   "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: colors.rust, borderColor: colors.rust },
  checkmark:       { fontFamily: fonts.mono, fontSize: 12, color: colors.paper },
  checkLabel:      { fontFamily: fonts.sans, fontSize: 13, color: colors.ink },

  signBtn: {
    backgroundColor: colors.rust,
    padding:         spacing.md,
    alignItems:      "center",
  },
  signBtnDisabled: { opacity: 0.4 },
  signBtnText: {
    fontFamily:    fonts.mono,
    fontSize:      13,
    letterSpacing: 2,
    color:         colors.paper,
  },
});
