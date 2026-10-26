/**
 * Plan hand-off to the web. Plans are bought on homegentic.app only (issue #50,
 * Apple 3.1.3(a) reader-app model): the app opens the browser, then re-reads
 * the plan from the payment canister when the user comes back.
 */
import React, { useState } from "react";
import { Alert, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { useAppData } from "../../context/AppData";
import {
  CONTRACTOR_PRO_FEATURES, CONTRACTOR_PRO_PRICE_LABEL, isPaid, PRO_FEATURES, PRO_PRICE_LABEL, tierName,
} from "../../services/planService";
import { openAccountPage, openUpgradePage } from "../../services/upgradePage";
import { Icon } from "../../components/Icon";
import { Card, Kicker, Pill, PushedScroll } from "../../components/ui";
import { family, type, v3 } from "../../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Upgrade">;
type Step = "intro" | "away" | "done";

export default function UpgradeScreen({ navigation }: Props) {
  const app = useAppData();
  const [step, setStep] = useState<Step>("intro");
  const [checking, setChecking] = useState(false);
  // Remember where we started so "done" still describes the upgrade after the plan flips.
  const [startedPro] = useState(app.pro);

  const contractor = app.contractor;
  const target   = contractor ? "Contractor Pro" : "Pro";
  const price    = contractor ? CONTRACTOR_PRO_PRICE_LABEL : PRO_PRICE_LABEL;
  const features = contractor ? CONTRACTOR_PRO_FEATURES : PRO_FEATURES;
  const url      = startedPro ? "homegentic.app/account" : "homegentic.app/pricing";

  async function primary() {
    if (step === "intro") {
      await (startedPro ? openAccountPage() : openUpgradePage()).catch(() => {});
      setStep("away");
      return;
    }
    if (step === "away") {
      setChecking(true);
      const tier = await app.refreshPlan();
      setChecking(false);
      app.refreshUsage();
      if (startedPro) { navigation.goBack(); return; }
      if (isPaid(tier)) { setStep("done"); return; }
      Alert.alert(
        `Still on ${tierName(tier)}`,
        "We didn't see a payment yet. If you just paid, give it a minute and check again.",
      );
      return;
    }
    navigation.goBack();
  }

  const label = step === "intro"
    ? (startedPro ? "Manage on homegentic.app" : "Continue on homegentic.app")
    : step === "away" ? "I'm back, check my plan" : "Back to the app";

  return (
    <PushedScroll
      backLabel="Back"
      onBack={navigation.goBack}
      footer={
        <>
          <Pill label={label} icon={step === "intro" ? "external" : undefined} block loading={checking} onPress={primary} style={{ minHeight: 52 }} />
          {step === "intro" && (
            <Text style={{ fontFamily: family.body, fontSize: 11.5, lineHeight: 17, color: v3.muted, textAlign: "center", marginTop: 10 }}>
              Opens your browser. Nothing is charged in the app.
            </Text>
          )}
        </>
      }
    >
      {step === "intro" && (
        <>
          <Kicker style={{ marginTop: 12 }}>{startedPro ? "YOUR PLAN" : "UPGRADE"}</Kicker>
          <Text style={[type.pageTitle, { marginTop: 10 }]}>
            {startedPro ? `You're on ${tierName(app.tier)}.` : `${target} is ${price}.`}
          </Text>
          <Text style={[type.body, { fontSize: 13.5, lineHeight: 21.6, marginTop: 9 }]}>
            {startedPro
              ? "Renewal, card and cancellation are managed on homegentic.app. Changes there show up here automatically."
              : "Plans are bought on homegentic.app. Your plan is saved to your HomeGentic account, so the app unlocks as soon as payment goes through."}
          </Text>
          <Card style={{ marginTop: 18 }}>
            {features.map((f, i) => (
              <View key={f} style={{ minHeight: 44, paddingVertical: 13, paddingHorizontal: 18, borderBottomWidth: i === features.length - 1 ? 0 : 1, borderBottomColor: v3.lineSoft, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Icon name="check" size={16} color={v3.blue} strokeWidth={2.8} />
                <Text style={{ fontFamily: family.bodyMedium, fontSize: 13.5, lineHeight: 18.9, color: v3.ink }}>{f}</Text>
              </View>
            ))}
          </Card>
          <View style={{ backgroundColor: v3.field, borderWidth: 1, borderColor: v3.line, borderRadius: 20, padding: 18, marginTop: 14 }}>
            <Kicker>HOW IT WORKS</Kicker>
            <View style={{ gap: 12, marginTop: 14 }}>
              {[
                startedPro ? "Open your account on homegentic.app." : `Pay for ${target} on homegentic.app.`,
                "Your plan is saved to your account, not to this phone.",
                "Come back to the app. It picks up the plan with no restore step.",
              ].map((t, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 100, backgroundColor: v3.ink, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontFamily: family.monoBold, fontSize: 10, color: v3.paper }}>{i + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, fontFamily: family.body, fontSize: 13, lineHeight: 19.5, color: v3.ink, paddingTop: 2 }}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      )}

      {step === "away" && (
        <View style={{ paddingTop: 34 }}>
          <View style={{ width: 58, height: 58, borderRadius: 100, backgroundColor: v3.lineSoft, borderWidth: 1, borderColor: v3.line, alignItems: "center", justifyContent: "center" }}>
            <Icon name="globe" size={26} color={v3.ink} />
          </View>
          <Text style={{ fontFamily: family.display, fontSize: 26, lineHeight: 30, letterSpacing: -0.78, color: v3.ink, marginTop: 20 }}>Finish in your browser</Text>
          <Text style={[type.body, { fontSize: 13.5, lineHeight: 21.6, marginTop: 10 }]}>
            {startedPro
              ? "Make your changes on homegentic.app. When you come back, the app reads your plan from your account."
              : `Complete checkout on homegentic.app. When you come back, the app checks your account and unlocks ${target}.`}
          </Text>
          <View style={{ alignSelf: "flex-start", borderWidth: 1.5, borderColor: v3.chipLine, borderRadius: 100, paddingVertical: 10, paddingHorizontal: 14, marginTop: 18 }}>
            <Text style={{ fontFamily: family.monoMedium, fontSize: 12, color: v3.ink }}>{url}</Text>
          </View>
        </View>
      )}

      {step === "done" && (
        <View style={{ paddingTop: 34 }}>
          <View style={{ width: 58, height: 58, borderRadius: 100, backgroundColor: v3.blueTint, borderWidth: 1, borderColor: v3.blueLine, alignItems: "center", justifyContent: "center" }}>
            <Icon name="check" size={27} color={v3.blue} strokeWidth={3} />
          </View>
          <Text style={{ fontFamily: family.display, fontSize: 26, lineHeight: 30, letterSpacing: -0.78, color: v3.ink, marginTop: 20 }}>You're on {tierName(app.tier)}.</Text>
          <Text style={[type.body, { fontSize: 13.5, lineHeight: 21.6, marginTop: 10 }]}>
            {contractor
              ? "Your account picked up the upgrade from the web. Lead alerts now reach you as soon as a job posts, your portfolio and automatic review requests are on, and referral fees stop with your next winning bid."
              : "Your account picked up the upgrade from the web. 20 properties, shared access and PDF export are unlocked."}
          </Text>
          <Card style={{ marginTop: 22, borderRadius: 20 }}>
            {[
              ["PLAN", contractor ? tierName(app.tier) : `${tierName(app.tier)} · yearly`],
              ["BILLED BY", "homegentic.app"],
              ["RECEIPT", "Emailed to you"],
              ["MANAGE", "homegentic.app/account"],
            ].map(([k, v], i) => (
              <View key={k} style={{ paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: i === 3 ? 0 : 1, borderBottomColor: v3.lineSoft, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 14 }}>
                <Kicker style={{ letterSpacing: 1.08 }}>{k}</Kicker>
                <Text style={{ fontFamily: family.bodySemi, fontSize: 13.5, color: v3.ink, textAlign: "right" }}>{v}</Text>
              </View>
            ))}
          </Card>
        </View>
      )}
    </PushedScroll>
  );
}
