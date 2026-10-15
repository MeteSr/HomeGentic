import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import {
  createRecurringService, Frequency, FREQUENCY_LABEL, RecurringServiceType, SERVICE_LABEL,
} from "../../services/upkeepService";
import { Kicker, Pill, PushedScroll } from "../../components/ui";
import { family, type, v3 } from "../../theme";

type Props = NativeStackScreenProps<RootStackParamList, "AddRecurring">;

const TYPES = Object.keys(SERVICE_LABEL) as RecurringServiceType[];
const FREQS = Object.keys(FREQUENCY_LABEL) as Frequency[];

function todayIso(): string {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

/** Pure — returns an error message, or null when the form can be saved. */
export function validateRecurring(f: { providerName: string; startDate: string }): string | null {
  if (!f.providerName.trim()) return "Add who does the work.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.startDate) || isNaN(new Date(f.startDate).getTime())) return "Use a date like 2026-10-21.";
  return null;
}

function Choice({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 15, borderRadius: 100, borderWidth: 1.5, borderColor: on ? v3.ink : v3.chipLine, backgroundColor: on ? v3.ink : v3.surface }}
    >
      <Text style={{ fontFamily: family.bodySemi, fontSize: 12.5, color: on ? v3.paper : v3.ink }}>{label}</Text>
    </Pressable>
  );
}

const input = {
  minHeight: 46, borderWidth: 1.5, borderColor: v3.chipLine, borderRadius: 12, backgroundColor: v3.surface,
  paddingVertical: 12, paddingHorizontal: 14, marginTop: 9, fontFamily: family.body, fontSize: 14, color: v3.ink,
} as const;

export default function AddRecurringScreen({ route, navigation }: Props) {
  const { propertyId } = route.params;
  const [serviceType, setType] = useState<RecurringServiceType>("LawnCare");
  const [frequency, setFreq]   = useState<Frequency>("Monthly");
  const [providerName, setProvider] = useState("");
  const [providerPhone, setPhone]   = useState("");
  const [startDate, setStart]       = useState(todayIso());
  const [notes, setNotes]           = useState("");
  const [saving, setSaving]         = useState(false);

  async function save() {
    const err = validateRecurring({ providerName, startDate });
    if (err) { Alert.alert("Almost there", err); return; }
    setSaving(true);
    try {
      await createRecurringService(propertyId, {
        serviceType, frequency, startDate,
        providerName: providerName.trim(),
        providerPhone: providerPhone.trim() || null,
        notes: notes.trim() || null,
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert("Couldn't save the service", e?.message ?? "Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PushedScroll
      backLabel="Back"
      onBack={navigation.goBack}
      footer={<Pill label="Save service" block loading={saving} onPress={save} style={{ minHeight: 52 }} />}
    >
      <Kicker style={{ marginTop: 12 }}>RECURRING SERVICE</Kicker>
      <Text style={[type.pageTitle, { marginTop: 10 }]}>Add a service</Text>
      <Text style={[type.body, { fontSize: 13, lineHeight: 20.8, marginTop: 9 }]}>
        Track each visit so the record shows the house was looked after.
      </Text>

      <Kicker style={{ marginTop: 22 }}>SERVICE</Kicker>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
        {TYPES.map((t) => <Choice key={t} label={t === "Other" ? "Other" : SERVICE_LABEL[t]} on={t === serviceType} onPress={() => setType(t)} />)}
      </View>

      <Kicker style={{ marginTop: 22 }}>HOW OFTEN</Kicker>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
        {FREQS.map((f) => <Choice key={f} label={FREQUENCY_LABEL[f].phrase} on={f === frequency} onPress={() => setFreq(f)} />)}
      </View>

      <Kicker style={{ marginTop: 22 }}>WHO DOES IT</Kicker>
      <TextInput style={input} value={providerName} onChangeText={setProvider} placeholder="Greenway Lawn Co" placeholderTextColor={v3.muted} accessibilityLabel="Provider name" />
      <TextInput style={input} value={providerPhone} onChangeText={setPhone} placeholder="Phone (optional)" placeholderTextColor={v3.muted} keyboardType="phone-pad" accessibilityLabel="Provider phone" />

      <Kicker style={{ marginTop: 22 }}>FIRST VISIT</Kicker>
      <TextInput style={input} value={startDate} onChangeText={setStart} placeholder="YYYY-MM-DD" placeholderTextColor={v3.muted} autoCapitalize="none" accessibilityLabel="First visit date" />

      <Kicker style={{ marginTop: 22 }}>NOTES</Kicker>
      <TextInput
        style={[input, { minHeight: 80, textAlignVertical: "top" }]}
        value={notes}
        onChangeText={setNotes}
        placeholder="$65 a visit, gate code 4410"
        placeholderTextColor={v3.muted}
        multiline
        accessibilityLabel="Notes"
      />
    </PushedScroll>
  );
}
