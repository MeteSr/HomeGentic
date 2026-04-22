import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Switch,
  Image,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ChatStackParamList } from "../navigation/ChatStack";
import { createJob, uploadJobPhoto } from "../services/jobService";
import {
  SERVICE_TYPES,
  validateJobForm,
  buildJobPayload,
  type JobForm,
} from "../services/jobFormService";
import { colors, fonts, spacing, borderWidth } from "../theme";

type Props = NativeStackScreenProps<ChatStackParamList, "LogJob">;

const EMPTY_FORM: JobForm = {
  serviceType:    "",
  description:    "",
  amountDollars:  "",
  completedDate:  "",
  isDiy:          false,
  contractorName: "",
  permitNumber:   "",
};

function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

export default function LogJobScreen({ route, navigation }: Props) {
  const { propertyId, propertyAddress } = route.params;

  const [form,       setForm]       = useState<JobForm>(EMPTY_FORM);
  const [photoUri,   setPhotoUri]   = useState<string | null>(null);
  const [photoB64,   setPhotoB64]   = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof JobForm>(key: K, value: JobForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Allow photo library access to attach a photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setPhotoB64(result.assets[0].base64 ?? null);
    }
  }

  async function submit() {
    const error = validateJobForm(form);
    if (error) {
      Alert.alert("Check your entry", error);
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildJobPayload(propertyId, form);
      const job     = await createJob(payload);

      if (photoB64) {
        await uploadJobPhoto(job.id, job.propertyId, photoB64);
      }

      navigation.goBack();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      Alert.alert("Could not save job", msg);
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
        {/* Property context */}
        <Text style={styles.propertyLine} numberOfLines={1}>{propertyAddress}</Text>

        {/* Service type chips */}
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

        {/* Description */}
        <Label>DESCRIPTION</Label>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={form.description}
          onChangeText={(v) => update("description", v)}
          placeholder="What was done?"
          placeholderTextColor={colors.inkLight}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* Amount */}
        <Label>AMOUNT</Label>
        <View style={styles.amountRow}>
          <Text style={styles.dollarSign}>$</Text>
          <TextInput
            style={[styles.input, styles.amountInput]}
            value={form.amountDollars}
            onChangeText={(v) => update("amountDollars", v)}
            placeholder="0"
            placeholderTextColor={colors.inkLight}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Date */}
        <Label>DATE COMPLETED</Label>
        <TextInput
          style={styles.input}
          value={form.completedDate}
          onChangeText={(v) => update("completedDate", v)}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.inkLight}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />

        {/* DIY toggle */}
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>DIY (no contractor)</Text>
          <Switch
            value={form.isDiy}
            onValueChange={(v) => update("isDiy", v)}
            trackColor={{ true: colors.rust, false: colors.rule }}
            thumbColor={colors.paper}
          />
        </View>

        {/* Contractor name — hidden for DIY */}
        {!form.isDiy && (
          <>
            <Label>CONTRACTOR NAME</Label>
            <TextInput
              style={styles.input}
              value={form.contractorName}
              onChangeText={(v) => update("contractorName", v)}
              placeholder="Company or individual"
              placeholderTextColor={colors.inkLight}
            />
          </>
        )}

        {/* Permit number (optional) */}
        <Label>PERMIT # (OPTIONAL)</Label>
        <TextInput
          style={styles.input}
          value={form.permitNumber}
          onChangeText={(v) => update("permitNumber", v)}
          placeholder="e.g. P-2026-00123"
          placeholderTextColor={colors.inkLight}
          autoCapitalize="characters"
        />

        {/* Photo */}
        <Label>PHOTO (OPTIONAL)</Label>
        <TouchableOpacity
          style={styles.photoBox}
          onPress={pickPhoto}
          accessibilityRole="button"
          accessibilityLabel="Add photo"
        >
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
          ) : (
            <Text style={styles.photoPrompt}>+ Add Photo</Text>
          )}
        </TouchableOpacity>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={submit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Log job"
        >
          {submitting ? (
            <ActivityIndicator color={colors.paper} />
          ) : (
            <Text style={styles.submitText}>LOG JOB</Text>
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
    fontFamily:    fonts.sans,
    fontSize:      13,
    color:         colors.inkLight,
    marginBottom:  spacing.lg,
  },

  label: {
    fontFamily:    fonts.mono,
    fontSize:      10,
    letterSpacing: 1.5,
    color:         colors.inkLight,
    marginTop:     spacing.lg,
    marginBottom:  spacing.sm,
  },

  // Service type chips
  chipsRow: { flexDirection: "row", marginBottom: spacing.sm },
  chip: {
    borderWidth:        borderWidth,
    borderColor:        colors.rule,
    paddingHorizontal:  spacing.md,
    paddingVertical:    spacing.sm,
    marginRight:        spacing.sm,
  },
  chipSelected:     { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText:         { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.inkLight },
  chipTextSelected: { color: colors.paper },

  // Inputs
  input: {
    borderWidth:     borderWidth,
    borderColor:     colors.rule,
    padding:         spacing.md,
    fontFamily:      fonts.sans,
    fontSize:        15,
    color:           colors.ink,
    backgroundColor: colors.paper,
  },
  textArea: { minHeight: 80 },

  amountRow:   { flexDirection: "row", alignItems: "center" },
  dollarSign:  {
    fontFamily:  fonts.serif,
    fontSize:    22,
    color:       colors.ink,
    marginRight: spacing.sm,
    lineHeight:  28,
  },
  amountInput: { flex: 1 },

  // DIY switch
  switchRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    marginTop:      spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth:    borderWidth,
    borderBottomWidth: borderWidth,
    borderColor:       colors.rule,
  },
  switchLabel: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink },

  // Photo
  photoBox: {
    height:          140,
    borderWidth:     borderWidth,
    borderColor:     colors.rule,
    alignItems:      "center",
    justifyContent:  "center",
    backgroundColor: "#EEEBE4",
    overflow:        "hidden",
  },
  photoPreview:  { width: "100%", height: "100%" },
  photoPrompt:   { fontFamily: fonts.mono, fontSize: 12, color: colors.inkLight, letterSpacing: 1 },

  // Submit button
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
