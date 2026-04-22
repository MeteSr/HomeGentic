/**
 * 15.8.5 — Camera-first photo upload
 *
 * Launched from PropertyDetailScreen's job row (long-press or dedicated button).
 * Opens the camera immediately on mount; the gallery is available as a fallback.
 * Validates the asset, shows a preview with file-size info, and uploads on confirm.
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ChatStackParamList } from "../navigation/ChatStack";
import {
  validateImageAsset,
  uploadPhoto,
  formatFileSize,
  type ImageAsset,
} from "../services/photoUploadService";
import { colors, fonts, spacing, borderWidth } from "../theme";

type Props = NativeStackScreenProps<ChatStackParamList, "PhotoUpload">;

export default function PhotoUploadScreen({ route, navigation }: Props) {
  const { jobId, propertyId, jobServiceType } = route.params;

  const [asset,     setAsset]     = useState<ImageAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // Open camera immediately on mount (camera-first UX)
  useEffect(() => {
    openCamera();
  }, []);

  async function openCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Camera access required",
        "Allow camera access in Settings to take a photo.",
        [
          { text: "Use Library Instead", onPress: openLibrary },
          { text: "Cancel", style: "cancel", onPress: () => navigation.goBack() },
        ],
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes:  ["images"],
      quality:     0.8,
      base64:      true,
      exif:        false,
    });

    handlePickerResult(result);
  }

  async function openLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Allow photo library access in Settings.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:  ["images"],
      quality:     0.8,
      base64:      true,
    });

    handlePickerResult(result);
  }

  function handlePickerResult(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || !result.assets[0]) {
      navigation.goBack();
      return;
    }

    const a = result.assets[0];
    const pickedAsset: ImageAsset = {
      uri:      a.uri,
      base64:   a.base64 ?? null,
      mimeType: a.mimeType ?? "image/jpeg",
      fileSize: a.fileSize ?? 0,
      width:    a.width,
      height:   a.height,
    };

    const validationError = validateImageAsset(pickedAsset);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setAsset(pickedAsset);
  }

  async function handleUpload() {
    if (!asset) return;
    setUploading(true);
    try {
      await uploadPhoto(jobId, propertyId, asset);
      Alert.alert("Photo uploaded", "The photo has been attached to this job.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      Alert.alert("Upload failed", msg);
    } finally {
      setUploading(false);
    }
  }

  // ── No asset yet (waiting for picker or showing error) ──────────────────────

  if (!asset) {
    return (
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={openCamera}>
              <Text style={styles.retryBtnText}>TRY AGAIN</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.libraryBtn} onPress={openLibrary}>
              <Text style={styles.libraryBtnText}>CHOOSE FROM LIBRARY</Text>
            </TouchableOpacity>
          </>
        ) : (
          <ActivityIndicator color={colors.rust} />
        )}
      </View>
    );
  }

  // ── Preview + confirm ────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: asset.uri }}
        style={styles.preview}
        resizeMode="cover"
      />

      <View style={styles.meta}>
        <Text style={styles.jobLabel}>{jobServiceType} JOB</Text>
        <Text style={styles.fileMeta}>
          {asset.width} × {asset.height}  ·  {formatFileSize(asset.fileSize)}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.retakeBtn} onPress={openCamera} disabled={uploading}>
          <Text style={styles.retakeBtnText}>RETAKE</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
          onPress={handleUpload}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel="Upload photo"
        >
          {uploading
            ? <ActivityIndicator color={colors.paper} size="small" />
            : <Text style={styles.uploadBtnText}>ATTACH PHOTO</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  center:    { flex: 1, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center", padding: spacing.lg },

  preview: {
    flex:   1,
    width:  "100%",
  },

  meta: {
    backgroundColor:   colors.ink,
    padding:           spacing.md,
    flexDirection:     "row",
    justifyContent:    "space-between",
    alignItems:        "center",
    borderTopWidth:    borderWidth,
    borderTopColor:    "#333",
  },
  jobLabel:  { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 2, color: colors.paper },
  fileMeta:  { fontFamily: fonts.mono, fontSize: 10, color: colors.inkLight, letterSpacing: 0.5 },

  actions: {
    flexDirection:     "row",
    backgroundColor:   colors.ink,
    paddingHorizontal: spacing.md,
    paddingBottom:     spacing.lg,
    gap:               spacing.sm,
  },

  retakeBtn: {
    flex:          1,
    borderWidth:   borderWidth,
    borderColor:   "#555",
    padding:       spacing.md,
    alignItems:    "center",
  },
  retakeBtnText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.5, color: colors.inkLight },

  uploadBtn: {
    flex:            2,
    backgroundColor: colors.rust,
    padding:         spacing.md,
    alignItems:      "center",
  },
  uploadBtnDisabled: { opacity: 0.5 },
  uploadBtnText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.5, color: colors.paper },

  errorText:     { fontFamily: fonts.sans, fontSize: 14, color: colors.ink, textAlign: "center", marginBottom: spacing.lg },
  retryBtn:      { backgroundColor: colors.rust, padding: spacing.md, marginBottom: spacing.sm, width: "100%" },
  retryBtnText:  { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 2, color: colors.paper, textAlign: "center" },
  libraryBtn:    { padding: spacing.md },
  libraryBtnText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.inkLight, textAlign: "center" },
});
