/**
 * BillUploadScreen — Epic #49 mobile bill upload
 *
 * Lets homeowners photograph or pick a utility bill from their library.
 * Sends the image to /api/extract-bill (Claude Vision) and presents the
 * extracted fields for confirmation before saving to the bills canister.
 *
 * Entry point: PropertyDetailScreen → "UTILITY BILLS" row → BillUpload
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ChatStackParamList } from "../navigation/ChatStack";
import {
  extractBill,
  addBill,
  TierLimitReachedError,
  type BillExtraction,
  type BillType,
  type AddBillArgs,
} from "../services/billService";
import { colors, fonts, spacing, borderWidth } from "../theme";

type Props = NativeStackScreenProps<ChatStackParamList, "BillUpload">;

const BILL_TYPES: BillType[] = ["Electric", "Gas", "Water", "Internet", "Telecom", "Other"];
const USAGE_UNITS = ["kWh", "gallons", "therms", "Mbps"];

export default function BillUploadScreen({ route, navigation }: Props) {
  const { propertyId, propertyAddress } = route.params;

  const [step, setStep]             = useState<"pick" | "confirm" | "saving">("pick");
  const [extraction, setExtraction] = useState<BillExtraction | null>(null);
  const [form, setForm]             = useState<Partial<AddBillArgs>>({
    billType:    "Other",
    provider:    "",
    periodStart: "",
    periodEnd:   "",
    amountCents: 0,
  });

  // ── Image capture helpers ───────────────────────────────────────────────────

  async function requestPermission(type: "camera" | "library"): Promise<boolean> {
    if (type === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      return status === "granted";
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === "granted";
  }

  async function handlePickSource(source: "camera" | "library") {
    const ok = await requestPermission(source);
    if (!ok) {
      Alert.alert(
        "Permission required",
        `Please allow ${source === "camera" ? "camera" : "photo library"} access in Settings.`,
      );
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality:    0.85,
            base64:     true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality:    0.85,
            base64:     true,
          });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert("Error", "Could not read image data. Please try again.");
      return;
    }

    setStep("saving"); // reuse "saving" label as "extracting"
    try {
      const mimeType = asset.mimeType ?? "image/jpeg";
      const fileName = asset.fileName ?? `bill-${Date.now()}.jpg`;
      const extracted = await extractBill(fileName, mimeType, asset.base64);
      setExtraction(extracted);
      setForm({
        billType:    extracted.billType    ?? "Other",
        provider:    extracted.provider    ?? "",
        periodStart: extracted.periodStart ?? "",
        periodEnd:   extracted.periodEnd   ?? "",
        amountCents: extracted.amountCents ?? 0,
        usageAmount: extracted.usageAmount,
        usageUnit:   extracted.usageUnit   ?? "kWh",
      });
      setStep("confirm");
    } catch (err) {
      Alert.alert(
        "Extraction failed",
        "Could not read the bill automatically. Please fill in the details manually.",
      );
      setForm({ billType: "Other", provider: "", periodStart: "", periodEnd: "", amountCents: 0, usageUnit: "kWh" });
      setStep("confirm");
    }
  }

  // ── Save confirmed bill ─────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.provider?.trim()) {
      Alert.alert("Missing field", "Please enter the provider name.");
      return;
    }
    if (!form.periodStart || !form.periodEnd) {
      Alert.alert("Missing field", "Please enter the billing period.");
      return;
    }

    setStep("saving");
    try {
      const saved = await addBill({
        propertyId,
        billType:    form.billType ?? "Other",
        provider:    form.provider ?? "",
        periodStart: form.periodStart ?? "",
        periodEnd:   form.periodEnd ?? "",
        amountCents: form.amountCents ?? 0,
        usageAmount: form.usageAmount,
        usageUnit:   form.usageUnit,
      });

      if (saved.anomalyFlag) {
        Alert.alert(
          "⚡ Anomaly Detected",
          saved.anomalyReason ?? "This bill is above your 3-month average.",
          [{ text: "OK", onPress: () => navigation.goBack() }],
        );
      } else {
        Alert.alert("Saved", "Bill recorded successfully.", [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
      }
    } catch (err) {
      if (err instanceof TierLimitReachedError) {
        Alert.alert(
          "🔒 Upgrade Required",
          err.message,
          [
            { text: "Upgrade", onPress: () => Linking.openURL("https://homegentic.app/pricing") },
            { text: "Cancel", style: "cancel", onPress: () => navigation.goBack() },
          ]
        );
      } else {
        Alert.alert("Error", "Failed to save bill. Please try again.");
      }
      setStep("confirm");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (step === "pick") {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Upload a Utility Bill</Text>
        <Text style={styles.subheading}>
          Photograph or select a bill — HomeGentic will read the provider, period, and amount.
        </Text>

        <TouchableOpacity style={styles.primaryBtn} onPress={() => handlePickSource("camera")}>
          <Text style={styles.primaryBtnText}>📷  Take a Photo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={() => handlePickSource("library")}>
          <Text style={styles.secondaryBtnText}>🖼  Choose from Library</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>Supported: JPEG, PNG, WebP · Max 10 MB</Text>
      </View>
    );
  }

  if (step === "saving" && !extraction) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.rust} />
        <Text style={styles.extractingLabel}>Reading bill…</Text>
      </View>
    );
  }

  if (step === "saving" && extraction) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.rust} />
        <Text style={styles.extractingLabel}>Saving…</Text>
      </View>
    );
  }

  // step === "confirm"
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xl * 2 }}>
      <Text style={styles.heading}>Confirm Bill Details</Text>
      {extraction && (
        <Text style={styles.subheading}>
          {extraction.description}  ·  confidence: {extraction.confidence}
        </Text>
      )}

      {/* Bill Type */}
      <Text style={styles.label}>BILL TYPE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {BILL_TYPES.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.chip, form.billType === t && styles.chipActive]}
            onPress={() => setForm((p) => ({ ...p, billType: t }))}
          >
            <Text style={[styles.chipText, form.billType === t && styles.chipTextActive]}>
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Provider */}
      <Text style={styles.label}>PROVIDER</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. FPL, TECO, Duke Energy"
        placeholderTextColor={colors.inkLight}
        value={form.provider ?? ""}
        onChangeText={(v) => setForm((p) => ({ ...p, provider: v }))}
      />

      {/* Period */}
      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: spacing.sm }}>
          <Text style={styles.label}>PERIOD START</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.inkLight}
            value={form.periodStart ?? ""}
            onChangeText={(v) => setForm((p) => ({ ...p, periodStart: v }))}
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>PERIOD END</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.inkLight}
            value={form.periodEnd ?? ""}
            onChangeText={(v) => setForm((p) => ({ ...p, periodEnd: v }))}
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>

      {/* Amount */}
      <Text style={styles.label}>AMOUNT ($)</Text>
      <TextInput
        style={styles.input}
        placeholder="0.00"
        placeholderTextColor={colors.inkLight}
        value={form.amountCents != null ? (form.amountCents / 100).toFixed(2) : ""}
        onChangeText={(v) => setForm((p) => ({ ...p, amountCents: Math.round((parseFloat(v) || 0) * 100) }))}
        keyboardType="decimal-pad"
      />

      {/* Usage */}
      <Text style={styles.label}>USAGE (OPTIONAL)</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1, marginRight: spacing.sm }]}
          placeholder="842"
          placeholderTextColor={colors.inkLight}
          value={form.usageAmount != null ? String(form.usageAmount) : ""}
          onChangeText={(v) => setForm((p) => ({ ...p, usageAmount: v ? parseFloat(v) : undefined }))}
          keyboardType="decimal-pad"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          {USAGE_UNITS.map((u) => (
            <TouchableOpacity
              key={u}
              style={[styles.chip, form.usageUnit === u && styles.chipActive]}
              onPress={() => setForm((p) => ({ ...p, usageUnit: u }))}
            >
              <Text style={[styles.chipText, form.usageUnit === u && styles.chipTextActive]}>{u}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <TouchableOpacity style={[styles.primaryBtn, { marginTop: spacing.lg }]} onPress={handleSave}>
        <Text style={styles.primaryBtnText}>Save Bill</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep("pick")}>
        <Text style={styles.secondaryBtnText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    padding: spacing.lg,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  heading: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  subheading: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.inkLight,
    marginBottom: spacing.lg,
    lineHeight: 18,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.inkLight,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth,
    borderColor: colors.rule,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
    padding: spacing.sm,
    backgroundColor: colors.paper,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  chipRow: {
    flexDirection: "row",
    marginBottom: spacing.xs,
  },
  chip: {
    borderWidth,
    borderColor: colors.rule,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginRight: spacing.xs,
  },
  chipActive: {
    borderColor: colors.rust,
    backgroundColor: colors.rust,
  },
  chipText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkLight,
  },
  chipTextActive: {
    color: colors.paper,
  },
  primaryBtn: {
    backgroundColor: colors.rust,
    padding: spacing.md,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  primaryBtnText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.paper,
  },
  secondaryBtn: {
    borderWidth,
    borderColor: colors.rule,
    padding: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  secondaryBtnText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.inkLight,
  },
  hint: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.inkLight,
    textAlign: "center",
    marginTop: spacing.lg,
    letterSpacing: 0.5,
  },
  extractingLabel: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.inkLight,
    marginTop: spacing.md,
    letterSpacing: 1,
  },
});
