import React, { useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { errorMessage } from "@homegentic/shared/canisterError";
import type { RootStackParamList } from "../../navigation/types";
import { useAppData } from "../../context/AppData";
import { registerProperty } from "../../services/propertyService";
import {
  buildPropertyArgs, emptyPropertyForm, PROPERTY_TYPES, validateNewProperty, type NewPropertyForm,
} from "../../services/onboardingForm";
import { Choice, inputStyle } from "../../components/Choice";
import { Kicker, Pill, PushedScroll } from "../../components/ui";
import { type, v3 } from "../../theme";

type Props = NativeStackScreenProps<RootStackParamList, "AddProperty">;

/** Add a home from the phone: the web wizard's address and details steps. */
export default function AddPropertyScreen({ navigation }: Props) {
  const app = useAppData();
  const [form, setForm]     = useState<NewPropertyForm>(emptyPropertyForm());
  const [saving, setSaving] = useState(false);
  const set = (k: keyof NewPropertyForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    const err = validateNewProperty(form);
    if (err) { Alert.alert("Almost there", err); return; }
    setSaving(true);
    try {
      const p = await registerProperty(buildPropertyArgs(form, app.tier));
      await app.refreshProperties();
      app.setActivePropertyId(p.id);
      navigation.goBack();
    } catch (e) {
      Alert.alert("Couldn't add the home", errorMessage(e, "Try again in a moment."));
    } finally {
      setSaving(false);
    }
  }

  const field = (k: keyof NewPropertyForm, label: string, extra: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
    <TextInput style={inputStyle} value={form[k]} onChangeText={set(k)} placeholder={label} placeholderTextColor={v3.muted}
      accessibilityLabel={label} {...extra} />
  );

  return (
    <PushedScroll
      backLabel="Back"
      onBack={navigation.goBack}
      footer={<Pill label="Save home" block loading={saving} onPress={save} style={{ minHeight: 52 }} />}
    >
      <Kicker style={{ marginTop: 12 }}>NEW HOME</Kicker>
      <Text style={[type.pageTitle, { marginTop: 10 }]}>Add your home</Text>
      <Text style={[type.body, { fontSize: 13, lineHeight: 20.8, marginTop: 9 }]}>
        The address and a few details start its record. You can verify ownership and add photos afterwards on homegentic.app.
      </Text>

      <Kicker style={{ marginTop: 22 }}>ADDRESS</Kicker>
      {field("address", "Street address", { autoComplete: "street-address" })}
      {field("city", "City")}
      <View style={{ flexDirection: "row", gap: 9 }}>
        <View style={{ flex: 1 }}>{field("state", "State", { autoCapitalize: "characters", maxLength: 2 })}</View>
        <View style={{ flex: 2 }}>{field("zipCode", "ZIP code", { keyboardType: "number-pad", maxLength: 10, autoComplete: "postal-code" })}</View>
      </View>

      <Kicker style={{ marginTop: 22 }}>TYPE</Kicker>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
        {PROPERTY_TYPES.map((t) => (
          <Choice key={t.value} label={t.label} on={form.propertyType === t.value} onPress={() => setForm((f) => ({ ...f, propertyType: t.value }))} />
        ))}
      </View>

      <Kicker style={{ marginTop: 22 }}>DETAILS</Kicker>
      <View style={{ flexDirection: "row", gap: 9 }}>
        <View style={{ flex: 1 }}>{field("yearBuilt", "Year built", { keyboardType: "number-pad", maxLength: 4 })}</View>
        <View style={{ flex: 1 }}>{field("squareFeet", "Square feet", { keyboardType: "number-pad" })}</View>
      </View>
    </PushedScroll>
  );
}
