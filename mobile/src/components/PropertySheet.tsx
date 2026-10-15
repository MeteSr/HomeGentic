import React from "react";
import { Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAppData } from "../context/AppData";
import { openAddProperty } from "../screens/v3/NoProperty";
import { Icon } from "./Icon";
import { Callout, CloseButton, Kicker, Pill, Sheet } from "./ui";
import { family, v3 } from "../theme";

/** "YOUR PROPERTIES" switcher. Properties beyond the plan's limit show as needing Pro. */
export function PropertySheet() {
  const app = useAppData();
  const navigation = useNavigation<any>();
  const atLimit = app.properties.length >= app.limits.propertyLimit;

  return (
    <Sheet visible={app.propsOpen} onClose={app.closeProps}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 2 }}>
        <Kicker>YOUR PROPERTIES</Kicker>
        <CloseButton onPress={app.closeProps} />
      </View>

      <View style={{ gap: 10, marginTop: 18 }}>
        {app.properties.map((p) => {
          const on = p.id === app.activeProperty?.id;
          const locked = app.isPropertyLocked(p);
          const verified = p.verificationLevel === "Premium" || p.verificationLevel === "Basic";
          const chip = locked ? "NEEDS PRO" : verified ? "VERIFIED" : p.verificationLevel === "PendingReview" ? "IN REVIEW" : "UNVERIFIED";
          return (
            <Pressable
              key={p.id}
              disabled={locked}
              onPress={() => { app.setActivePropertyId(p.id); app.closeProps(); }}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: locked }}
              accessibilityLabel={`${p.street}${locked ? ", needs Pro" : ""}`}
              style={{
                backgroundColor: on ? v3.ink : locked ? v3.field : v3.surface,
                borderWidth: 2, borderColor: on ? v3.ink : v3.line, borderRadius: 20, padding: 17,
                flexDirection: "row", alignItems: "center", gap: 14,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: family.displayBold, fontSize: 16, lineHeight: 19.2, letterSpacing: -0.32, color: on ? v3.paper : locked ? v3.muted : v3.ink }}>{p.street}</Text>
                <Text style={{ fontFamily: family.mono, fontSize: 11, lineHeight: 15.4, color: on ? v3.paperDim : v3.muted, marginTop: 7 }}>
                  {`${p.city}, ${p.state} ${p.zipCode}`.toUpperCase()}{p.yearBuilt ? ` · BUILT ${p.yearBuilt}` : ""}
                </Text>
              </View>
              <View style={{
                borderRadius: 100, paddingVertical: 6, paddingHorizontal: 9, borderWidth: 1,
                backgroundColor: on ? "rgba(252,252,253,0.14)" : locked ? v3.yellowTint : v3.blueTint,
                borderColor: on ? "rgba(252,252,253,0.28)" : locked ? v3.yellow : v3.blueLine,
              }}>
                <Text style={{ fontFamily: family.monoMedium, fontSize: 9, letterSpacing: 0.9, color: on ? v3.paper : locked ? v3.ink : v3.blue }}>{chip}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {!app.pro && (
        <Callout style={{ borderRadius: 20, padding: 18, marginTop: 12 }}>
          <Text style={{ fontFamily: family.body, fontSize: 13, lineHeight: 20.2, color: v3.ink }}>
            Free covers one property. Pro is $59 a year and covers 20.
          </Text>
          <Pill label="Upgrade on the web" variant="ink" style={{ marginTop: 14 }} onPress={() => { app.closeProps(); navigation.navigate("Upgrade"); }} />
        </Callout>
      )}

      <Pressable
        onPress={() => {
          app.closeProps();
          if (atLimit && !app.pro) navigation.navigate("Upgrade");
          else openAddProperty().then(app.refreshProperties);
        }}
        accessibilityRole="button"
        style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderRadius: 100, borderWidth: 1.5, borderColor: v3.chipLine, marginTop: 12 }}
      >
        <Icon name="plus" size={16} color={v3.ink} strokeWidth={2.4} />
        <Text style={{ fontFamily: family.bodySemi, fontSize: 13.5, color: v3.ink }}>Add a property</Text>
      </Pressable>
    </Sheet>
  );
}
