/**
 * #715: the emergency card on the phone. Shutoffs, alarm, insurer claim line
 * and the people to call, plus storm steps for homes in hurricane states.
 * Opens from the copy kept on the phone when the network is down.
 *
 * Copy limit: practical steps only; life-safety decisions are left to local
 * emergency officials.
 */
import React from "react";
import { Linking, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { useAuthContext } from "../../auth/AuthContext";
import { useLoad } from "../../hooks/useLoad";
import { loadEmergencyCard } from "../../services/emergencyCardService";
import { Callout, Card, EmptyRow, Kicker, Loading, Pill, PushedScroll, Row, SectionLabel } from "../../components/ui";
import { type, v3 } from "../../theme";
import {
  AFTER_STORM_STEPS,
  PRE_STORM_CHECKLIST,
  isHurricaneZone,
  officialSources,
  telHref,
  type EmergencyContact,
} from "@homegentic/shared/emergency";

type Props = NativeStackScreenProps<RootStackParamList, "EmergencyCard">;

function savedDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function CallPill({ phone, label }: { phone: string; label: string }) {
  const href = telHref(phone);
  if (!href) return <Text style={[type.body, { color: v3.ink }]}>{phone}</Text>;
  return (
    <Pill
      small
      variant="outline"
      label={phone}
      accessibilityLabel={`${label} ${phone}`}
      onPress={() => Linking.openURL(href)}
    />
  );
}

export default function EmergencyCardScreen({ route, navigation }: Props) {
  const { propertyId, propertyAddress, state } = route.params;
  const { authState } = useAuthContext();
  const scope = authState.status === "authenticated" ? authState.principal : "";
  const data = useLoad(() => loadEmergencyCard(propertyId, scope), `${scope}:${propertyId}`);
  const loaded = data.data;
  const card = loaded?.card;

  const contactRow = (c: EmergencyContact, i: number, all: EmergencyContact[]) => (
    <Row key={`${c.name}-${i}`} last={i === all.length - 1}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={type.rowTitle}>{c.name}</Text>
        {c.role ? <Text style={[type.meta, { marginTop: 4 }]}>{c.role}</Text> : null}
      </View>
      {c.phone ? <CallPill phone={c.phone} label={`Call ${c.name}`} /> : null}
    </Row>
  );

  return (
    <PushedScroll
      backLabel="Back"
      onBack={navigation.goBack}
      refreshing={data.loading && !!loaded}
      onRefresh={data.reload}
    >
      <Kicker style={{ marginTop: 12 }}>EMERGENCY CARD</Kicker>
      <Text style={[type.pageTitle, { marginTop: 10 }]} accessibilityRole="header">
        {propertyAddress}
      </Text>

      <Pill
        label="Get emergency help"
        accessibilityLabel="Get emergency help"
        style={{ marginTop: 16 }}
        onPress={() => navigation.navigate("QuoteRequest", { propertyId, propertyAddress, urgency: "emergency" })}
      />
      <Text style={[type.body, { marginTop: 8 }]}>
        Starts a quote request for this home with its urgency set to Emergency.
      </Text>

      {!loaded ? (
        data.loading ? (
          <Loading />
        ) : (
          <Card flat style={{ marginTop: 18 }}>
            <EmptyRow text="Couldn't load the emergency card, and there's no copy on this phone yet. Open it once while you're online and it will be saved here." />
          </Card>
        )
      ) : (
        <>
          {loaded.fromPhone && (
            <Callout style={{ marginTop: 16 }}>
              <Text style={[type.body, { color: v3.ink }]}>
                You're offline. This is the copy saved on this phone on {savedDate(loaded.savedAt)}. Alarm notes aren't
                kept on the phone.
              </Text>
            </Callout>
          )}

          <SectionLabel>SHUTOFFS</SectionLabel>
          <Card>
            {card!.shutoffs.map((s, i) => (
              <Row key={s.key} last={i === card!.shutoffs.length - 1}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Kicker>{s.label.toUpperCase()}</Kicker>
                  <Text style={[type.body, { marginTop: 5, color: s.where ? v3.ink : v3.muted }]}>
                    {s.where || "Not written down yet"}
                  </Text>
                </View>
              </Row>
            ))}
          </Card>

          {card!.alarm ? (
            <>
              <SectionLabel>ALARM</SectionLabel>
              <Card>
                <EmptyRow text={card!.alarm} />
              </Card>
            </>
          ) : null}

          {card!.insurer && (
            <>
              <SectionLabel>INSURANCE</SectionLabel>
              <Card>
                <Row>
                  <View style={{ flex: 1 }}>
                    <Kicker>INSURER</Kicker>
                    <Text style={[type.rowTitle, { marginTop: 5 }]}>{card!.insurer.carrier}</Text>
                  </View>
                </Row>
                {card!.insurer.policyNumber ? (
                  <Row>
                    <View style={{ flex: 1 }}>
                      <Kicker>POLICY NUMBER</Kicker>
                      <Text style={[type.rowTitle, { marginTop: 5 }]}>{card!.insurer.policyNumber}</Text>
                    </View>
                  </Row>
                ) : null}
                <Row last>
                  <View style={{ flex: 1 }}>
                    <Kicker>CLAIM LINE</Kicker>
                    {!card!.insurer.claimLine?.phone && (
                      <Text style={[type.body, { marginTop: 5 }]}>
                        Not saved. Add it as a house guide contact with the role "Insurance claims" on homegentic.app.
                      </Text>
                    )}
                  </View>
                  {card!.insurer.claimLine?.phone ? (
                    <CallPill phone={card!.insurer.claimLine.phone} label="Call the claim line" />
                  ) : null}
                </Row>
              </Card>
            </>
          )}

          {card!.contacts.length > 0 && (
            <>
              <SectionLabel>PEOPLE TO CALL</SectionLabel>
              <Card>{card!.contacts.map(contactRow)}</Card>
            </>
          )}

          {card!.missing.length > 0 && (
            <>
              <SectionLabel>NOT ON THIS CARD YET</SectionLabel>
              <Card flat>
                <EmptyRow
                  text={`${card!.missing.join(" · ")}. Add these in the house guide and Insurance tab on homegentic.app.`}
                />
              </Card>
            </>
          )}
        </>
      )}

      {isHurricaneZone(state) && (
        <>
          <SectionLabel>BEFORE A STORM</SectionLabel>
          <Card>
            {PRE_STORM_CHECKLIST.map((item, i) => (
              <Row key={item.id} last={i === PRE_STORM_CHECKLIST.length - 1}>
                <Text style={[type.body, { color: v3.ink, flex: 1 }]}>{item.text}</Text>
              </Row>
            ))}
          </Card>
          <SectionLabel>AFTER A STORM</SectionLabel>
          <Card>
            {AFTER_STORM_STEPS.map((step, i) => (
              <Row key={step.id} last={i === AFTER_STORM_STEPS.length - 1}>
                <Text style={[type.body, { color: v3.ink, flex: 1 }]}>{`${i + 1}. ${step.text}`}</Text>
              </Row>
            ))}
          </Card>
          <Text style={[type.body, { marginTop: 14 }]}>
            Follow local emergency officials for evacuation orders, shelters and when it's safe to go back.
          </Text>
          <View style={{ gap: 8, marginTop: 10 }}>
            {officialSources(state).map((s) => (
              <Pill
                key={s.url}
                small
                variant="outline"
                label={s.label}
                accessibilityLabel={s.label}
                onPress={() => Linking.openURL(s.url)}
              />
            ))}
          </View>
        </>
      )}
    </PushedScroll>
  );
}
