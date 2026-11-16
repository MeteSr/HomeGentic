import React, { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage } from "@homegentic/shared/canisterError";
import { useAuthContext } from "../auth/AuthContext";
import type { UserRole } from "../services/authTypes";
import { validateRegistration } from "../services/onboardingForm";
import { HOMEGENTIC_WEB_URL } from "../services/reportService";
import { Choice, inputStyle } from "../components/Choice";
import { Kicker, Pill, readable } from "../components/ui";
import { family, type, v3 } from "../theme";

const ROLES: { value: UserRole; label: string; desc: string }[] = [
  { value: "Homeowner",  label: "Homeowner",  desc: "Register properties, log maintenance jobs, and build your verified home history." },
  { value: "Contractor", label: "Contractor", desc: "Sign verified job completions, receive leads, and build your reputation on-chain." },
  { value: "Realtor",    label: "Realtor",    desc: "Access verified property histories to streamline transactions and build buyer trust." },
];

const web = (path: string) => `${HOMEGENTIC_WEB_URL.replace(/\/$/, "")}${path}`;

/** Shown after a first Internet Identity sign-in, before the app: the same two questions as the web Register page. */
export default function RegisterScreen() {
  const { completeRegistration, logout } = useAuthContext();
  const insets = useSafeAreaInsets();
  const [role, setRole]     = useState<UserRole>("Homeowner");
  const [email, setEmail]   = useState("");
  const [phone, setPhone]   = useState("");
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const err = validateRegistration({ role, email, phone, agreed });
    if (err) { Alert.alert("Almost there", err); return; }
    setSaving(true);
    try {
      await completeRegistration({ role, email: email.trim(), phone: phone.trim() });
    } catch (e) {
      Alert.alert("Couldn't create your account", errorMessage(e, "Try again in a moment."));
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: v3.bg }}
      contentContainerStyle={[readable, { paddingTop: insets.top + 24, paddingHorizontal: 18, paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Kicker>WELCOME</Kicker>
      <Text style={[type.pageTitle, { marginTop: 10 }]} accessibilityRole="header">Create your account</Text>
      <Text style={[type.body, { fontSize: 13, lineHeight: 20.8, marginTop: 9 }]}>
        You're signed in with Internet Identity. Two more things and you're in.
      </Text>

      <Kicker style={{ marginTop: 24 }}>I'M A</Kicker>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
        {ROLES.map((r) => <Choice key={r.value} label={r.label} on={r.value === role} onPress={() => setRole(r.value)} />)}
      </View>
      <Text style={[type.body, { fontSize: 12.5, lineHeight: 19, marginTop: 9, color: v3.muted }]}>
        {ROLES.find((r) => r.value === role)!.desc}
      </Text>

      <Kicker style={{ marginTop: 24 }}>CONTACT</Kicker>
      <TextInput style={inputStyle} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={v3.muted}
        keyboardType="email-address" autoCapitalize="none" autoComplete="email" accessibilityLabel="Email" />
      <TextInput style={inputStyle} value={phone} onChangeText={setPhone} placeholder="Phone (optional)" placeholderTextColor={v3.muted}
        keyboardType="phone-pad" autoComplete="tel" accessibilityLabel="Phone (optional)" />

      <Pressable
        onPress={() => setAgreed((a) => !a)}
        accessibilityRole="checkbox"
        accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
        accessibilityState={{ checked: agreed }}
        style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 20, minHeight: 44 }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: agreed ? v3.ink : v3.chipLine, backgroundColor: agreed ? v3.ink : v3.surface, alignItems: "center", justifyContent: "center" }}>
          {agreed && <Text style={{ color: v3.paper, fontFamily: family.bodySemi, fontSize: 13 }}>✓</Text>}
        </View>
        <Text style={[type.body, { flex: 1, fontSize: 13, lineHeight: 19 }]}>I agree to the Terms of Service and Privacy Policy</Text>
      </Pressable>
      <View style={{ flexDirection: "row", gap: 16, marginTop: 6 }}>
        <Text style={{ fontFamily: family.bodySemi, fontSize: 12.5, color: v3.blue }} accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(web("/terms"))}>Read the terms</Text>
        <Text style={{ fontFamily: family.bodySemi, fontSize: 12.5, color: v3.blue }} accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(web("/privacy"))}>Read the privacy policy</Text>
      </View>

      <Pill label="Create account" block loading={saving} onPress={submit} style={{ marginTop: 26, minHeight: 52 }} />
      <Pill label="Sign out" variant="outline" block onPress={logout} style={{ marginTop: 10 }} />
    </ScrollView>
  );
}
