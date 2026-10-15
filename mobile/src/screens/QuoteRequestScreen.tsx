import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { createQuoteRequest } from "../services/quoteService";
import {
  URGENCY_LEVELS,
  urgencyLabel,
  validateQuoteForm,
  buildQuotePayload,
  type QuoteForm,
  type Urgency,
} from "../services/quoteFormService";
import { SERVICE_TYPES } from "../services/jobFormService";
import { colors, fonts, spacing, borderWidth } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "QuoteRequest">;

const URGENCY_COLORS: Record<Urgency, string> = {
  low:       colors.inkLight,
  medium:    "#8B7A3A",
  high:      colors.rust,
  emergency: "#8B1A1A",
};

const EMPTY_FORM: QuoteForm = {
  serviceType: "",
  urgency:     "",
  description: "",
};

function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

export default function QuoteRequestScreen({ route, navigation }: Props) {
  const { propertyId, propertyAddress } = route.params;

  const [form,       setForm]       = useState<QuoteForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof QuoteForm>(key: K, value: QuoteForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    const error = validateQuoteForm(form);
    if (error) {
      Alert.alert("Check your entry", error);
      return;
    }

    setSubmitting(true);
    try {
      await createQuoteRequest(buildQuotePayload(propertyId, form));
      navigation.replace("MyQuotes", { propertyId, propertyAddress });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      Alert.alert("Could not submit request", msg);
    } finally {
      setSubmitting(false);
    }
  }

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
        <Text style={styles.propertyLine} numberOfLines={1}>{propertyAddress}</Text>

        {/* Service type */}
        <Label>SERVICE TYPE</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
          {SERVICE_TYPES.map((type) => {
            const selected = form.serviceType === type;
            return (
              <TouchableOpacity
                key={type}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => update("serviceType", type)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {type}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Urgency */}
        <Label>URGENCY</Label>
        <View style={styles.urgencyRow}>
          {URGENCY_LEVELS.map((u) => {
            const selected = form.urgency === u;
            return (
              <TouchableOpacity
                key={u}
                style={[
                  styles.urgencyChip,
                  selected && { backgroundColor: URGENCY_COLORS[u], borderColor: URGENCY_COLORS[u] },
                ]}
                onPress={() => update("urgency", u)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.urgencyText, selected && styles.urgencyTextSelected]}>
                  {urgencyLabel(u).toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Description */}
        <Label>DESCRIBE THE WORK NEEDED</Label>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={form.description}
          onChangeText={(v) => update("description", v)}
          placeholder="Be specific — contractors use this to prepare estimates."
          placeholderTextColor={colors.inkLight}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />
        <Text style={styles.charHint}>{form.description.trim().length} chars (min 10)</Text>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={submit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Submit quote request"
        >
          {submitting ? (
            <ActivityIndicator color={colors.paper} />
          ) : (
            <Text style={styles.submitText}>REQUEST QUOTES</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll:   { flex: 1, backgroundColor: colors.paper },
  content:  { padding: spacing.md, paddingBottom: spacing.xxl },

  propertyLine: {
    fontFamily:   fonts.sans,
    fontSize:     13,
    color:        colors.inkLight,
    marginBottom: spacing.lg,
  },

  label: {
    fontFamily:    fonts.mono,
    fontSize:      10,
    letterSpacing: 1.5,
    color:         colors.inkLight,
    marginTop:     spacing.lg,
    marginBottom:  spacing.sm,
  },

  chipsRow: { flexDirection: "row", marginBottom: spacing.sm },
  chip: {
    borderWidth:       borderWidth,
    borderColor:       colors.rule,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    marginRight:       spacing.sm,
  },
  chipSelected:     { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText:         { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.inkLight },
  chipTextSelected: { color: colors.paper },

  urgencyRow: { flexDirection: "row", gap: spacing.sm },
  urgencyChip: {
    flex:              1,
    borderWidth:       borderWidth,
    borderColor:       colors.rule,
    paddingVertical:   spacing.sm,
    alignItems:        "center",
  },
  urgencyText:         { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: colors.inkLight },
  urgencyTextSelected: { color: colors.paper },

  input: {
    borderWidth:     borderWidth,
    borderColor:     colors.rule,
    padding:         spacing.md,
    fontFamily:      fonts.sans,
    fontSize:        15,
    color:           colors.ink,
    backgroundColor: colors.paper,
  },
  textArea: { minHeight: 120 },
  charHint: {
    fontFamily: fonts.mono,
    fontSize:   9,
    color:      colors.inkLight,
    marginTop:  4,
    textAlign:  "right",
  },

  submitBtn: {
    backgroundColor: colors.rust,
    padding:         spacing.md,
    alignItems:      "center",
    marginTop:       spacing.xl,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: {
    fontFamily:    fonts.mono,
    fontSize:      13,
    letterSpacing: 2,
    color:         colors.paper,
  },
});
