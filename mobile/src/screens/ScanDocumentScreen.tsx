/**
 * ScanDocumentScreen — Issue #51
 *
 * Lets homeowners photograph or pick an appliance manual, warranty card,
 * receipt, permit, or inspection report from their library.
 * Sends the image to /api/extract-document (Claude Vision) and presents the
 * extracted fields for confirmation before saving.
 *
 * Entry point: PropertyDetailScreen → "SCAN DOCUMENT" row → ScanDocument
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
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ChatStackParamList } from "../navigation/ChatStack";
import {
  extractDocument,
  documentTypeLabel,
  type DocumentExtraction,
} from "../services/documentService";
import { colors, fonts, spacing, borderWidth } from "../theme";

type Props = NativeStackScreenProps<ChatStackParamList, "ScanDocument">;

type Step = "pick" | "extracting" | "confirm";

interface ConfirmForm {
  brand:          string;
  modelNumber:    string;
  serialNumber:   string;
  serviceType:    string;
  purchaseDate:   string;
  warrantyMonths: string;
}

export default function ScanDocumentScreen({ route, navigation }: Props) {
  const { propertyId, propertyAddress } = route.params;

  const [step,       setStep]       = useState<Step>("pick");
  const [extraction, setExtraction] = useState<DocumentExtraction | null>(null);
  const [form,       setForm]       = useState<ConfirmForm>({
    brand: "", modelNumber: "", serialNumber: "",
    serviceType: "", purchaseDate: "", warrantyMonths: "",
  });
  const [saved, setSaved] = useState(false);

  // ── Image capture ────────────────────────────────────────────────────────────

  async function pickImage(source: "camera" | "library") {
    const perm = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (perm.status !== "granted") {
      Alert.alert("Permission required", `Please grant ${source} access in Settings.`);
      return;
    }

    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.8 });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const base64 = asset.base64;
    if (!base64) { Alert.alert("Error", "Could not read image data."); return; }

    const mimeType  = asset.type === "image" ? "image/jpeg" : "image/jpeg";
    const fileName  = asset.fileName ?? "document.jpg";

    setStep("extracting");
    try {
      const data = await extractDocument(fileName, mimeType, base64);
      setExtraction(data);
      setForm({
        brand:          data.brand          ?? "",
        modelNumber:    data.modelNumber    ?? "",
        serialNumber:   data.serialNumber   ?? "",
        serviceType:    data.serviceType    ?? "",
        purchaseDate:   data.purchaseDate   ?? "",
        warrantyMonths: data.warrantyMonths != null ? String(data.warrantyMonths) : "",
      });
      setStep("confirm");
    } catch (err: unknown) {
      Alert.alert("Extraction failed", err instanceof Error ? err.message : "Try again.");
      setStep("pick");
    }
  }

  function handleChange(field: keyof ConfirmForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSave() {
    // In production: call warrantyService.save(form) or create a job.
    // For now: show success state — data ready to attach to a job.
    setSaved(true);
    setStep("pick");
  }

  const isLowConfidence = extraction?.confidence === "low";

  // ── Render ───────────────────────────────────────────────────────────────────

  if (saved) {
    return (
      <View style={styles.centered}>
        <Text style={styles.successIcon}>✓</Text>
        <Text style={styles.successTitle}>Document Saved</Text>
        <Text style={styles.successSub}>Log a job to attach the warranty to your property record.</Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate("LogJob", { propertyId, propertyAddress })}
        >
          <Text style={styles.primaryBtnText}>Log a Job</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSaved(false)}>
          <Text style={styles.linkBtn}>Scan Another</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === "extracting") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.rust} />
        <Text style={styles.extractingText}>Extracting document data…</Text>
      </View>
    );
  }

  if (step === "confirm" && extraction) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <Text style={styles.docTypeLabel}>
          {documentTypeLabel(extraction.documentType)}
        </Text>
        <Text style={styles.description}>{extraction.description}</Text>

        {isLowConfidence && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              Low confidence — review carefully. Fields may be inaccurate.
            </Text>
          </View>
        )}

        {(["brand", "modelNumber", "serialNumber", "serviceType", "purchaseDate", "warrantyMonths"] as const).map((field) => (
          <View key={field} style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>
              {field === "warrantyMonths" ? "Warranty (months)"
               : field === "modelNumber"  ? "Model #"
               : field === "serialNumber" ? "Serial #"
               : field === "purchaseDate" ? "Purchase Date"
               : field === "serviceType"  ? "Category"
               : "Brand"}
            </Text>
            <TextInput
              style={styles.input}
              value={form[field]}
              onChangeText={(v) => handleChange(field, v)}
              placeholder={`Enter ${field}`}
              placeholderTextColor={colors.inkLight}
              keyboardType={field === "warrantyMonths" ? "numeric" : "default"}
            />
          </View>
        ))}

        <TouchableOpacity style={styles.primaryBtn} onPress={handleSave}>
          <Text style={styles.primaryBtnText}>Save to Wallet</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setStep("pick")}>
          <Text style={styles.linkBtn}>← Scan a different document</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // step === "pick"
  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>SCAN DOCUMENT</Text>
      <Text style={styles.instructions}>
        Photograph an appliance manual, warranty card, receipt, permit, or inspection report.
        Brand, model, serial number, and warranty term will be extracted automatically.
      </Text>

      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={() => pickImage("camera")}
        accessibilityRole="button"
        accessibilityLabel="Take a photo"
      >
        <Text style={styles.primaryBtnText}>Take Photo</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.primaryBtn, styles.secondaryBtn]}
        onPress={() => pickImage("library")}
        accessibilityRole="button"
        accessibilityLabel="Choose from library"
      >
        <Text style={[styles.primaryBtnText, styles.secondaryBtnText]}>Choose from Library</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    padding: spacing.lg,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.inkLight,
    marginBottom: spacing.md,
  },
  instructions: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  docTypeLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.rust,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  description: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.inkLight,
    marginBottom: spacing.md,
  },
  warningBox: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FCD34D",
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  warningText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: "#B45309",
  },
  fieldRow: {
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.inkLight,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  input: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.ink,
    borderWidth: borderWidth,
    borderColor: colors.rule,
    padding: spacing.sm,
    backgroundColor: colors.paper,
  },
  primaryBtn: {
    backgroundColor: colors.rust,
    padding: spacing.md,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  primaryBtnText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1,
    color: "#fff",
    textTransform: "uppercase",
  },
  secondaryBtn: {
    backgroundColor: "transparent",
    borderWidth: borderWidth,
    borderColor: colors.ink,
  },
  secondaryBtnText: {
    color: colors.ink,
  },
  linkBtn: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkLight,
    textAlign: "center",
    marginTop: spacing.sm,
    letterSpacing: 0.5,
  },
  extractingText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.inkLight,
    marginTop: spacing.md,
  },
  successIcon: {
    fontSize: 40,
    color: colors.sage,
    marginBottom: spacing.sm,
  },
  successTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  successSub: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.inkLight,
    textAlign: "center",
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
});
