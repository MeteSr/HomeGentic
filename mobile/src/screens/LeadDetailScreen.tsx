import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ContractorStackParamList } from "../navigation/ContractorStack";
import { submitBid } from "../services/bidService";
import {
  validateBidForm,
  buildBidPayload,
  type BidForm,
} from "../services/bidFormService";
import { colors, fonts, spacing, borderWidth } from "../theme";

type Props = NativeStackScreenProps<ContractorStackParamList, "LeadDetail">;

const URGENCY_COLOR: Record<string, string> = {
  Low:       colors.inkLight,
  Medium:    "#8B7A3A",
  High:      colors.rust,
  Emergency: "#8B1A1A",
};

function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

export default function LeadDetailScreen({ route, navigation }: Props) {
  const { lead } = route.params;

  const [form, setForm] = useState<BidForm>({
    amountDollars: "",
    timelineDays:  "",
    notes:         "",
  });
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof BidForm>(key: K, value: BidForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    const error = validateBidForm(form);
    if (error) {
      Alert.alert("Check your entry", error);
      return;
    }

    const payload = buildBidPayload(lead.id, form);

    Alert.alert(
      "Confirm bid",
      `Submit a $${(payload.amountCents / 100).toLocaleString()} bid with a ${payload.timelineDays}-day timeline?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          onPress: async () => {
            setSubmitting(true);
            try {
              await submitBid(payload);
              Alert.alert(
                "Bid submitted",
                "You'll be notified when the homeowner responds.",
                [{ text: "OK", onPress: () => navigation.goBack() }],
              );
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Something went wrong";
              Alert.alert("Could not submit bid", msg);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  }

  const urgencyColor = URGENCY_COLOR[lead.urgency] ?? colors.inkLight;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Lead summary */}
        <View style={styles.hero}>
          <Text style={styles.serviceType}>{lead.serviceType}</Text>
          <Text style={[styles.urgency, { color: urgencyColor }]}>
            {lead.urgency.toUpperCase()}
          </Text>
          <Text style={styles.description}>{lead.description}</Text>
          <Text style={styles.zip}>{lead.propertyZip}</Text>
        </View>

        {/* Bid form */}
        <Label>YOUR BID AMOUNT</Label>
        <View style={styles.amountRow}>
          <Text style={styles.dollarSign}>$</Text>
          <TextInput
            style={[styles.input, styles.amountInput]}
            value={form.amountDollars}
            onChangeText={(v) => update("amountDollars", v)}
            placeholder="1500"
            placeholderTextColor={colors.inkLight}
            keyboardType="decimal-pad"
            accessibilityLabel="Bid amount"
          />
        </View>

        <Label>TIMELINE (DAYS)</Label>
        <TextInput
          style={styles.input}
          value={form.timelineDays}
          onChangeText={(v) => update("timelineDays", v)}
          placeholder="5"
          placeholderTextColor={colors.inkLight}
          keyboardType="number-pad"
          accessibilityLabel="Timeline in days"
        />

        <Label>NOTES (OPTIONAL)</Label>
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={form.notes}
          onChangeText={(v) => update("notes", v)}
          placeholder="Describe your approach, materials, or credentials…"
          placeholderTextColor={colors.inkLight}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Submit bid"
        >
          {submitting
            ? <ActivityIndicator color={colors.paper} size="small" />
            : <Text style={styles.submitBtnText}>SUBMIT BID</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll:   { flex: 1, backgroundColor: colors.paper },
  content:  { padding: spacing.md, paddingBottom: spacing.xxl },

  hero: {
    paddingBottom: spacing.lg,
    borderBottomWidth: borderWidth,
    borderBottomColor: colors.rule,
    marginBottom: spacing.sm,
  },
  serviceType: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, marginBottom: 4 },
  urgency:     { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 2, marginBottom: spacing.sm },
  description: { fontFamily: fonts.sans, fontSize: 15, color: colors.ink, lineHeight: 22, marginBottom: spacing.sm },
  zip:         { fontFamily: fonts.mono, fontSize: 11, color: colors.inkLight, letterSpacing: 0.5 },

  label: {
    fontFamily:    fonts.mono,
    fontSize:      10,
    letterSpacing: 1.5,
    color:         colors.inkLight,
    marginTop:     spacing.lg,
    marginBottom:  spacing.sm,
  },

  input: {
    borderWidth:     borderWidth,
    borderColor:     colors.rule,
    padding:         spacing.md,
    fontFamily:      fonts.sans,
    fontSize:        15,
    color:           colors.ink,
    backgroundColor: colors.paper,
  },
  amountRow:   { flexDirection: "row", alignItems: "center" },
  dollarSign:  { fontFamily: fonts.serif, fontSize: 22, color: colors.ink, marginRight: spacing.sm, lineHeight: 28 },
  amountInput: { flex: 1 },
  notesInput:  { minHeight: 100 },

  submitBtn: {
    marginTop:       spacing.xl,
    backgroundColor: colors.rust,
    padding:         spacing.md,
    alignItems:      "center",
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontFamily: fonts.mono, fontSize: 13, letterSpacing: 2, color: colors.paper },
});
