import React, { useState } from "react";
import { Alert, Linking, Pressable, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as WebBrowser from "expo-web-browser";
import type { RootStackParamList } from "../../navigation/types";
import { useLoad } from "../../hooks/useLoad";
import {
  acceptOffer, contactHref, counterOffer, currentAmountCents, FsboListing, FsboOffer, getFsboListing, getFsboOffers,
  getShowingRequests, isOfferOpen, parseDollars, rejectOffer, respondToShowing, ShowingAnswer, ShowingRequest,
  ShowingStatus, OfferStatus, updateListPrice,
} from "../../services/listingService";
import { HOMEGENTIC_WEB_URL } from "../../services/reportService";
import { Card, Chip, chipTone, CloseButton, EmptyRow, Kicker, Loading, Pill, PushedScroll, SectionLabel, Sheet } from "../../components/ui";
import { family, type, v3 } from "../../theme";

type Props = NativeStackScreenProps<RootStackParamList, "MyListing">;

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

export const SHOWING_CHIP: Record<ShowingStatus, { label: string; tone: { color: string; bg: string } }> = {
  Pending:           { label: "NEEDS A REPLY",  tone: chipTone.red },
  Accepted:          { label: "ACCEPTED",       tone: chipTone.blue },
  Declined:          { label: "DECLINED",       tone: chipTone.muted },
  AlternateProposed: { label: "NEW TIME SENT",  tone: chipTone.muted },
};

export const OFFER_CHIP: Record<OfferStatus, { label: string; tone: { color: string; bg: string } }> = {
  Active:    { label: "OPEN",      tone: chipTone.red },
  Countered: { label: "COUNTERED", tone: chipTone.red },
  Accepted:  { label: "ACCEPTED",  tone: chipTone.blue },
  Rejected:  { label: "REJECTED",  tone: chipTone.muted },
};

/** What the seller needs to do next, for the line under the title. */
export function listingSummary(showings: ShowingRequest[], offers: FsboOffer[]): string {
  const replies = showings.filter((s) => s.status === "Pending").length;
  const open = offers.filter(isOfferOpen).length;
  const accepted = offers.find((o) => o.status === "Accepted");
  if (accepted) return `You accepted ${accepted.buyerName}'s offer of ${money(currentAmountCents(accepted))}.`;
  const parts = [
    replies ? `${replies} showing ${replies === 1 ? "request needs" : "requests need"} a reply` : null,
    open ? `${open} open ${open === 1 ? "offer" : "offers"}` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(" and ")}.` : "Nothing waiting on you.";
}

const input = {
  minHeight: 46, borderWidth: 1.5, borderColor: v3.chipLine, borderRadius: 12, backgroundColor: v3.surface,
  paddingVertical: 12, paddingHorizontal: 14, marginTop: 9, fontFamily: family.body, fontSize: 14, color: v3.ink,
} as const;

type Editing =
  | { kind: "alternate"; showing: ShowingRequest }
  | { kind: "counter"; offer: FsboOffer }
  | { kind: "price" };

export default function MyListingScreen({ route, navigation }: Props) {
  const { propertyId } = route.params;
  const web = HOMEGENTIC_WEB_URL.replace(/\/$/, "");

  const data = useLoad(async () => {
    const listing = await getFsboListing(propertyId);
    if (!listing) return { listing: null as FsboListing | null, showings: [] as ShowingRequest[], offers: [] as FsboOffer[] };
    const [showings, offers] = await Promise.all([getShowingRequests(propertyId), getFsboOffers(propertyId)]);
    return { listing, showings, offers };
  }, propertyId);

  const [busy, setBusy]       = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [text, setText]       = useState("");
  const [notes, setNotes]     = useState("");
  const [fromSeller, setFromSeller] = useState(true);

  async function run(key: string, failTitle: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await fn();
      setEditing(null);
      await data.reload();
    } catch (e: any) {
      Alert.alert(failTitle, e?.message ?? "Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  function answer(s: ShowingRequest, a: ShowingAnswer) {
    run(`${s.id}:${a.kind}`, "Couldn't save your reply", () => respondToShowing(propertyId, s.id, a));
  }

  function openEditor(e: Editing) {
    setText(e.kind === "price" && d?.listing ? String(d.listing.listPriceCents / 100) : "");
    setNotes("");
    setFromSeller(true);
    setEditing(e);
  }

  function confirmAccept(o: FsboOffer) {
    const others = (d?.offers ?? []).filter((x) => x.id !== o.id && isOfferOpen(x)).length;
    Alert.alert(
      `Accept ${o.buyerName}'s offer?`,
      `${money(currentAmountCents(o))}.${others ? ` Your ${others} other open ${others === 1 ? "offer is" : "offers are"} marked rejected.` : ""} This records your decision here; your purchase contract is still signed outside HomeGentic.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Accept", onPress: () => run(`${o.id}:accept`, "Couldn't accept the offer", () => acceptOffer(propertyId, o.id)) },
      ],
    );
  }

  function confirmReject(o: FsboOffer) {
    Alert.alert(`Reject ${o.buyerName}'s offer?`, "It's marked rejected on your listing. HomeGentic doesn't contact the buyer.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reject", style: "destructive", onPress: () => run(`${o.id}:reject`, "Couldn't reject the offer", () => rejectOffer(propertyId, o.id)) },
    ]);
  }

  function saveEditor() {
    if (!editing) return;
    if (editing.kind === "alternate") {
      if (!text.trim()) { Alert.alert("Add a time", "Suggest a day and time, like Sunday 2pm."); return; }
      answer(editing.showing, { kind: "alternate", time: text });
      return;
    }
    const cents = parseDollars(text);
    if (cents == null) { Alert.alert("Check the amount", "Enter a dollar amount, like 425,000."); return; }
    if (editing.kind === "price") {
      run("price", "Couldn't change the price", () => updateListPrice(propertyId, cents));
    } else {
      const o = editing.offer;
      run(`${o.id}:counter`, "Couldn't save the counter", () => counterOffer(propertyId, o.id, cents, notes, fromSeller));
    }
  }

  const d = data.data;

  return (
    <PushedScroll backLabel="Back" onBack={navigation.goBack} refreshing={data.loading && !!d} onRefresh={data.reload}>
      <Kicker style={{ marginTop: 12 }}>MY LISTING · FOR SALE BY OWNER</Kicker>

      {!d ? (
        data.loading ? <Loading /> : (
          <Card flat style={{ marginTop: 18 }}>
            <EmptyRow text="Couldn't load your listing. Check your connection and pull down to try again." />
          </Card>
        )
      ) : !d.listing ? (
        <>
          <Text style={[type.pageTitle, { marginTop: 10 }]} accessibilityRole="header">Not listed</Text>
          <Text style={[type.body, { fontSize: 13, lineHeight: 20.8, marginTop: 9 }]}>
            This home isn't listed for sale. Create a For Sale By Owner listing on homegentic.app, then manage showings and offers here.
          </Text>
          <Pill label="Open homegentic.app" variant="ink" style={{ marginTop: 16 }} onPress={() => WebBrowser.openBrowserAsync(`${web}/my-listing/${encodeURIComponent(propertyId)}`)} />
        </>
      ) : (
        <>
          <Text style={[type.pageTitle, { marginTop: 10 }]} accessibilityRole="header">{d.listing.address}</Text>
          <Text style={[type.meta, { marginTop: 8 }]}>
            {[d.listing.city, d.listing.state].filter(Boolean).join(", ").toUpperCase()} · LIVE SINCE {shortDate(d.listing.activatedAt)}
          </Text>
          <Text style={[type.body, { fontSize: 13, lineHeight: 20.8, marginTop: 9 }]}>{listingSummary(d.showings, d.offers)}</Text>

          <Card style={{ marginTop: 18, padding: 18 }}>
            <Kicker>LIST PRICE</Kicker>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 }}>
              <Text style={{ flex: 1, fontFamily: family.display, fontSize: 26, letterSpacing: -0.78, color: v3.ink }}>{money(d.listing.listPriceCents)}</Text>
              <Pill label="Change" small variant="outline" onPress={() => openEditor({ kind: "price" })} accessibilityLabel="Change list price" />
            </View>
          </Card>

          <SectionLabel>SHOWING REQUESTS</SectionLabel>
          <Card>
            {d.showings.length === 0 ? (
              <EmptyRow text="No requests yet. Buyers ask from your public listing page, and you'll get a notification." />
            ) : d.showings.map((s, i) => {
              const chip = SHOWING_CHIP[s.status];
              const href = contactHref(s.contact);
              return (
                <View key={s.id} style={{ padding: 18, borderBottomWidth: i === d.showings.length - 1 ? 0 : 1, borderBottomColor: v3.lineSoft }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[type.rowTitle, { fontSize: 15 }]}>{s.name}</Text>
                      <Text style={[type.body, { marginTop: 4 }]}>
                        Asked for {s.preferredTime}{s.alternateTime ? `. You suggested ${s.alternateTime}.` : ""}
                      </Text>
                      {href ? (
                        <Pressable onPress={() => Linking.openURL(href).catch(() => {})} accessibilityRole="link" accessibilityLabel={`Contact ${s.name} at ${s.contact}`} style={{ minHeight: 32, justifyContent: "center" }}>
                          <Text style={{ fontFamily: family.bodySemi, fontSize: 13, color: v3.blue }}>{s.contact}</Text>
                        </Pressable>
                      ) : (
                        <Text style={[type.meta, { marginTop: 6 }]} selectable>{s.contact}</Text>
                      )}
                    </View>
                    <Chip label={chip.label} color={chip.tone.color} bg={chip.tone.bg} />
                  </View>
                  {s.status === "Pending" && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                      <Pill label="Accept" small loading={busy === `${s.id}:accept`} disabled={!!busy} onPress={() => answer(s, { kind: "accept" })} accessibilityLabel={`Accept showing for ${s.name}`} />
                      <Pill label="Suggest a time" small variant="outline" disabled={!!busy} onPress={() => openEditor({ kind: "alternate", showing: s })} accessibilityLabel={`Suggest another time to ${s.name}`} />
                      <Pill label="Decline" small variant="danger" loading={busy === `${s.id}:decline`} disabled={!!busy} onPress={() => answer(s, { kind: "decline" })} accessibilityLabel={`Decline showing for ${s.name}`} />
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
          {d.showings.some((s) => s.status !== "Declined") && (
            <Text style={[type.body, { marginTop: 10, marginHorizontal: 2 }]}>
              HomeGentic doesn't message buyers. After you reply here, contact them at the email or phone they left.
            </Text>
          )}

          <SectionLabel>OFFERS</SectionLabel>
          <Card>
            {d.offers.length === 0 ? (
              <EmptyRow text="No offers logged. Log offers you receive on homegentic.app to compare them here." />
            ) : d.offers.map((o, i) => {
              const chip = OFFER_CHIP[o.status];
              const last = o.counters[o.counters.length - 1];
              return (
                <View key={o.id} style={{ padding: 18, borderBottomWidth: i === d.offers.length - 1 ? 0 : 1, borderBottomColor: v3.lineSoft }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[type.rowTitle, { fontSize: 15 }]}>{o.buyerName}</Text>
                      <Text style={[type.meta, { fontSize: 11, marginTop: 5 }]}>
                        {[`EARNEST ${money(o.earnestMoneyCents)}`, `CLOSE ${shortDate(o.closeDate)}`, o.hasEscalationClause ? "ESCALATION" : null].filter(Boolean).join(" · ")}
                      </Text>
                      <Text style={[type.body, { marginTop: 5 }]}>
                        {o.contingencies.length ? `Contingent on ${o.contingencies.join(", ").toLowerCase()}.` : "No contingencies."}
                        {last ? ` Latest counter from ${last.fromSeller ? "you" : "the buyer"}${last.notes ? `: ${last.notes}` : "."}` : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 8 }}>
                      <Text style={{ fontFamily: family.displayBold, fontSize: 18, letterSpacing: -0.54, color: v3.ink }}>{money(currentAmountCents(o))}</Text>
                      <Chip label={chip.label} color={chip.tone.color} bg={chip.tone.bg} />
                    </View>
                  </View>
                  {isOfferOpen(o) && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                      <Pill label="Accept" small loading={busy === `${o.id}:accept`} disabled={!!busy} onPress={() => confirmAccept(o)} accessibilityLabel={`Accept ${o.buyerName}'s offer`} />
                      <Pill label="Counter" small variant="outline" disabled={!!busy} onPress={() => openEditor({ kind: "counter", offer: o })} accessibilityLabel={`Log a counter on ${o.buyerName}'s offer`} />
                      <Pill label="Reject" small variant="danger" loading={busy === `${o.id}:reject`} disabled={!!busy} onPress={() => confirmReject(o)} accessibilityLabel={`Reject ${o.buyerName}'s offer`} />
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
          <Pill
            label="Photos, description and offers on the web"
            small
            variant="outline"
            style={{ marginTop: 14 }}
            onPress={() => WebBrowser.openBrowserAsync(`${web}/my-listing/${encodeURIComponent(propertyId)}`)}
          />
        </>
      )}

      <Sheet visible={!!editing} onClose={() => setEditing(null)}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Text style={type.cardTitle} accessibilityRole="header">
            {editing?.kind === "alternate" ? `Suggest a time to ${editing.showing.name}` : editing?.kind === "counter" ? `Counter on ${editing.offer.buyerName}'s offer` : "Change list price"}
          </Text>
          <CloseButton onPress={() => setEditing(null)} />
        </View>

        {editing?.kind === "alternate" ? (
          <>
            <Text style={[type.body, { marginTop: 10 }]}>They asked for {editing.showing.preferredTime}. Save a time that works, then let them know.</Text>
            <TextInput style={input} value={text} onChangeText={setText} placeholder="Sunday 2pm" placeholderTextColor={v3.muted} accessibilityLabel="Suggested time" autoFocus />
          </>
        ) : editing?.kind === "counter" ? (
          <>
            <Text style={[type.body, { marginTop: 10 }]}>Record a counter you made or one the buyer sent. Currently {money(currentAmountCents(editing.offer))}.</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }} accessibilityRole="radiogroup">
              {[true, false].map((mine) => (
                <Pressable
                  key={String(mine)}
                  onPress={() => setFromSeller(mine)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: fromSeller === mine }}
                  style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 15, borderRadius: 100, borderWidth: 1.5, borderColor: fromSeller === mine ? v3.ink : v3.chipLine, backgroundColor: fromSeller === mine ? v3.ink : v3.surface }}
                >
                  <Text style={{ fontFamily: family.bodySemi, fontSize: 12.5, color: fromSeller === mine ? v3.paper : v3.ink }}>{mine ? "From me" : "From the buyer"}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={input} value={text} onChangeText={setText} placeholder="Amount, like 430,000" placeholderTextColor={v3.muted} keyboardType="decimal-pad" accessibilityLabel="Counter amount in dollars" />
            <TextInput style={[input, { minHeight: 70, textAlignVertical: "top" }]} value={notes} onChangeText={setNotes} placeholder="Notes (optional)" placeholderTextColor={v3.muted} multiline accessibilityLabel="Counter notes" />
          </>
        ) : editing?.kind === "price" ? (
          <>
            <Text style={[type.body, { marginTop: 10 }]}>Your public listing shows the new price straight away, and the change goes in its price history.</Text>
            <TextInput style={input} value={text} onChangeText={setText} placeholder="425,000" placeholderTextColor={v3.muted} keyboardType="decimal-pad" accessibilityLabel="List price in dollars" autoFocus />
          </>
        ) : null}

        <Pill
          label={editing?.kind === "alternate" ? "Save suggested time" : editing?.kind === "counter" ? "Save counter" : "Save price"}
          block
          loading={!!busy}
          style={{ marginTop: 18, minHeight: 52 }}
          onPress={saveEditor}
        />
      </Sheet>
    </PushedScroll>
  );
}
