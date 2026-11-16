import React, { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { errorMessage } from "@homegentic/shared/canisterError";
import type { RootStackParamList } from "../../navigation/types";
import { useAppData } from "../../context/AppData";
import { registerProperty, startMoveInPlan } from "../../services/propertyService";
import {
  buildPropertyArgs,
  emptyPropertyForm,
  PROPERTY_TYPES,
  validateNewProperty,
  type NewPropertyForm,
} from "../../services/onboardingForm";
import {
  lookupPropertyDetails,
  newAddressSessionToken,
  placeAddress,
  suggestAddresses,
  type AddressParts,
  type AddressSuggestion,
} from "../../services/propertyLookupService";
import {
  NO_ORIGINAL,
  SYSTEMS,
  saveSystemYears,
  yearsToSave,
  type YearChoice,
} from "../../services/systemYearsService";
import { Choice, inputStyle } from "../../components/Choice";
import { Kicker, Pill, PushedScroll } from "../../components/ui";
import { family, type, v3 } from "../../theme";

type Props = NativeStackScreenProps<RootStackParamList, "AddProperty">;

const SUGGEST_DEBOUNCE_MS = 300;

/**
 * Add a home from the phone, as the web wizard does: address suggestions,
 * details pre-filled from public records, "bought in the last 12 months?"
 * (starts the move-in plan), then each main system's install year.
 */
export default function AddPropertyScreen({ navigation }: Props) {
  const app = useAppData();
  const [form, setForm] = useState<NewPropertyForm>(emptyPropertyForm());
  const [saving, setSaving] = useState(false);
  const [bought, setBought] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [fromRecords, setFromRecords] = useState(false);
  const [saved, setSaved] = useState<{ id: string; yearBuilt: number } | null>(null);
  const session = useRef(newAddressSessionToken());
  const picked = useRef(false);
  const set = (k: keyof NewPropertyForm) => (v: string) => {
    if (k === "address") picked.current = false;
    setForm((f) => ({ ...f, [k]: v }));
  };

  // Suggestions while the street address is being typed.
  useEffect(() => {
    if (picked.current) return;
    let live = true;
    const t = setTimeout(() => {
      suggestAddresses(form.address, session.current)
        .then((s) => { if (live) setSuggestions(s.slice(0, 5)); })
        .catch(() => {});
    }, SUGGEST_DEBOUNCE_MS);
    return () => { live = false; clearTimeout(t); };
  }, [form.address]);

  async function pick(s: AddressSuggestion) {
    picked.current = true;
    setSuggestions([]);
    const parts = await placeAddress(s.placeId, session.current).catch(() => null);
    session.current = newAddressSessionToken();
    if (!parts) { setForm((f) => ({ ...f, address: s.main })); return; }
    setForm((f) => ({ ...f, address: parts.address, city: parts.city, state: parts.state, zipCode: parts.zipCode }));
    prefill(parts);
  }

  async function prefill(parts: AddressParts) {
    const d = await lookupPropertyDetails(parts).catch(() => null);
    if (!d) return;
    setForm((f) => ({
      ...f,
      yearBuilt:    f.yearBuilt || (d.yearBuilt ? String(d.yearBuilt) : ""),
      squareFeet:   f.squareFeet || (d.squareFeet ? String(d.squareFeet) : ""),
      propertyType: d.propertyType ?? f.propertyType,
    }));
    if (d.yearBuilt || d.squareFeet || d.propertyType) setFromRecords(true);
  }

  async function save() {
    const err = validateNewProperty(form);
    if (err) { Alert.alert("Almost there", err); return; }
    setSaving(true);
    try {
      const args = buildPropertyArgs(form, app.tier);
      const p = await registerProperty(args);
      if (bought) await startMoveInPlan(p.id).catch(() => {});
      await app.refreshProperties();
      app.setActivePropertyId(p.id);
      setSaved({ id: p.id, yearBuilt: args.yearBuilt });
    } catch (e) {
      Alert.alert("Couldn't add the home", errorMessage(e, "Try again in a moment."));
    } finally {
      setSaving(false);
    }
  }

  if (saved) return <SystemYearsStep propertyId={saved.id} yearBuilt={saved.yearBuilt} onDone={navigation.goBack} />;

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
      {suggestions.length > 0 && (
        <View style={{ marginTop: 6, borderWidth: 1.5, borderColor: v3.chipLine, borderRadius: 12, backgroundColor: v3.surface }}>
          {suggestions.map((s, i) => (
            <Pressable
              key={s.placeId}
              onPress={() => pick(s)}
              accessibilityRole="button"
              accessibilityLabel={`${s.main}, ${s.secondary}`}
              style={{ paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: v3.line }}
            >
              <Text style={{ fontFamily: family.bodySemi, fontSize: 13.5, color: v3.ink }}>{s.main}</Text>
              <Text style={{ fontFamily: family.body, fontSize: 12, color: v3.muted, marginTop: 2 }}>{s.secondary}</Text>
            </Pressable>
          ))}
        </View>
      )}
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
      {fromRecords && (
        <Text style={[type.body, { fontSize: 12.5, lineHeight: 19, marginTop: 8, color: v3.muted }]}>
          Filled in from public records. Check them and change anything that's wrong.
        </Text>
      )}
      <View style={{ flexDirection: "row", gap: 9 }}>
        <View style={{ flex: 1 }}>{field("yearBuilt", "Year built", { keyboardType: "number-pad", maxLength: 4 })}</View>
        <View style={{ flex: 1 }}>{field("squareFeet", "Square feet", { keyboardType: "number-pad" })}</View>
      </View>

      <Kicker style={{ marginTop: 22 }}>DID YOU BUY THIS HOME IN THE LAST 12 MONTHS?</Kicker>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 7, marginTop: 10 }}>
        <Choice label="Yes" a11yLabel="Bought in the last 12 months: Yes" on={bought === true} onPress={() => setBought(true)} />
        <Choice label="No" a11yLabel="Bought in the last 12 months: No" on={bought === false} onPress={() => setBought(false)} />
      </View>
      {bought && (
        <Text style={[type.body, { fontSize: 12.5, lineHeight: 19, marginTop: 8, color: v3.muted }]}>
          We'll start a move-in plan for it: the first things to check and change in a new home.
        </Text>
      )}
    </PushedScroll>
  );
}

/** Original or replaced, and when, for each main system; saved to the home record. */
function SystemYearsStep({ propertyId, yearBuilt, onDone }: { propertyId: string; yearBuilt: number; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, YearChoice>>({});
  const [saving, setSaving] = useState(false);
  const answer = (name: string) => answers[name] ?? { choice: null, year: "" };
  const update = (name: string, a: Partial<YearChoice>) =>
    setAnswers((all) => ({ ...all, [name]: { ...answer(name), ...a } }));

  async function save() {
    let years: Record<string, number>;
    try {
      years = yearsToSave(answers, yearBuilt);
    } catch (e) {
      Alert.alert("Almost there", (e as Error).message);
      return;
    }
    if (Object.keys(years).length === 0) { onDone(); return; }
    setSaving(true);
    try {
      await saveSystemYears(propertyId, years);
      onDone();
    } catch (e) {
      Alert.alert("Couldn't save the years", errorMessage(e, "Try again in a moment."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PushedScroll
      backLabel="Skip"
      onBack={onDone}
      footer={
        <View style={{ gap: 10 }}>
          <Pill label="Save years" block loading={saving} onPress={save} style={{ minHeight: 52 }} />
          <Pill label="Skip for now" variant="outline" block onPress={onDone} />
        </View>
      }
    >
      <Kicker style={{ marginTop: 12 }}>HOME SAVED</Kicker>
      <Text style={[type.pageTitle, { marginTop: 10 }]}>How old are your systems?</Text>
      <Text style={[type.body, { fontSize: 13, lineHeight: 20.8, marginTop: 9 }]}>
        {`For each one, say if it's original to the house (built ${yearBuilt}) or when it was replaced. Forecasts and your Monday Home Pulse count from these years. Skip any you don't know.`}
      </Text>
      {SYSTEMS.map(({ name, label, replacedLabel }) => {
        const a = answer(name);
        return (
          <View key={name} style={{ marginTop: 20 }}>
            <Kicker>{label.toUpperCase()}</Kicker>
            <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", gap: 7, marginTop: 10 }}>
              {!NO_ORIGINAL.has(name) && (
                <Choice label="Original" a11yLabel={`${label}: Original`} on={a.choice === "original"} onPress={() => update(name, { choice: "original" })} />
              )}
              <Choice label={replacedLabel} a11yLabel={`${label}: ${replacedLabel}`} on={a.choice === "replaced"} onPress={() => update(name, { choice: "replaced" })} />
            </View>
            {a.choice === "replaced" && (
              <TextInput
                style={[inputStyle, { maxWidth: 160 }]}
                value={a.year}
                onChangeText={(year) => update(name, { year })}
                placeholder="Year"
                placeholderTextColor={v3.muted}
                keyboardType="number-pad"
                maxLength={4}
                accessibilityLabel={`Year the ${label} was ${replacedLabel === "Installed" ? "installed" : "replaced"}`}
              />
            )}
          </View>
        );
      })}
    </PushedScroll>
  );
}
