import React, { useState } from "react";
import { Alert, Pressable, Share, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { useAppData } from "../../context/AppData";
import { useLoad } from "../../hooks/useLoad";
import {
  ApprovalRequest, getApprovals, getManagers, getOwnerNotifications, initials, inviteManager,
  ManagerRole, PropertyManager, removeManager, respondToApproval, spendLimitLabel, updateManager,
} from "../../services/propertyService";
import { HOMEGENTIC_WEB_URL } from "../../services/reportService";
import { managerMeta, ROLE_CHIP } from "./AccountScreen";
import { Callout, Card, Chip, EmptyRow, Kicker, Pill, PushedScroll, SectionLabel } from "../../components/ui";
import { family, type, v3 } from "../../theme";

type Props = NativeStackScreenProps<RootStackParamList, "People">;

const LIMITS: (number | null)[] = [null, 10_000, 50_000, 100_000];   // cents
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const ROLES: { role: ManagerRole; name: string; sub: string }[] = [
  { role: "Viewer",  name: "Viewer",   sub: "Sees records, jobs and reports. Cannot change anything." },
  { role: "Manager", name: "Manager",  sub: "Books and schedules work up to your spend limit. Anything above comes to you." },
  { role: "CoOwner", name: "Co-owner", sub: "Full control alongside you, with no spend limit. Cannot remove you." },
];

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
}

/** The limit every Manager shares, "mixed" if they differ, undefined if there are none. */
export function sharedLimit(managers: PropertyManager[]): number | null | "mixed" | undefined {
  const ms = managers.filter((m) => m.role === "Manager");
  if (!ms.length) return undefined;
  const first = ms[0].spendLimitCents;
  return ms.every((m) => m.spendLimitCents === first) ? first : "mixed";
}

export function inviteUrl(token: string): string {
  return `${HOMEGENTIC_WEB_URL.replace(/\/$/, "")}/manage/claim/${encodeURIComponent(token)}`;
}

export default function PeopleScreen({ navigation }: Props) {
  const app = useAppData();
  const prop = app.activeProperty;

  const data = useLoad(async () => {
    if (!prop) return null;
    const [managers, approvals, activity] = await Promise.all([
      getManagers(prop.id),
      getApprovals(prop.id).catch(() => [] as ApprovalRequest[]),
      getOwnerNotifications(prop.id).catch(() => []),
    ]);
    return { managers, approvals, activity };
  }, prop?.id ?? "");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [invRole, setInvRole]       = useState<ManagerRole>("Manager");
  const [invName, setInvName]       = useState("");
  const [busy, setBusy]             = useState<string | null>(null);
  const [pickedLimit, setPickedLimit] = useState<number | null | undefined>(undefined);

  if (!prop) {
    return <PushedScroll backLabel="Account" onBack={navigation.goBack}><EmptyRow text="Add a property first." /></PushedScroll>;
  }

  async function run(key: string, fn: () => Promise<unknown>, fail: string) {
    setBusy(key);
    try { await fn(); await data.reload(); }
    catch (e: any) { Alert.alert(fail, e?.message ?? "Try again in a moment."); }
    finally { setBusy(null); }
  }

  const managers = data.data?.managers ?? [];
  const pending  = (data.data?.approvals ?? []).filter((a) => a.status === "Pending");
  const current  = sharedLimit(managers);
  const limit    = pickedLimit !== undefined ? pickedLimit : current === "mixed" || current === undefined ? 50_000 : current;

  function changeRole(m: PropertyManager) {
    Alert.alert(`Change ${m.displayName}'s role`, undefined, [
      ...ROLES.filter((r) => r.role !== m.role).map((r) => ({
        text: r.name,
        onPress: () => run(m.principal, () => updateManager(prop!.id, m.principal, r.role, r.role === "Manager" ? limit : null), "Couldn't change the role"),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  function revoke(m: PropertyManager) {
    Alert.alert(`Revoke ${m.displayName}?`, "They lose access right away. Their past activity stays in the log.", [
      { text: "Cancel", style: "cancel" },
      { text: "Revoke", style: "destructive", onPress: () => run(m.principal, () => removeManager(prop!.id, m.principal), "Couldn't revoke access") },
    ]);
  }

  async function sendInvite() {
    const name = invName.trim();
    if (!name) { Alert.alert("Add a name", "Who is this for? For example, “Marcus, son”."); return; }
    setBusy("invite");
    try {
      const inv = await inviteManager(prop!.id, invRole, name, invRole === "Manager" ? limit : null);
      await Share.share({
        message: `You're invited to help manage ${prop!.street} on HomeGentic as a ${ROLE_CHIP[invRole].toLowerCase()}. Accept here: ${inviteUrl(inv.token)}`,
      });
      setInviteOpen(false);
      setInvName("");
      await data.reload();
    } catch (e: any) {
      Alert.alert("Couldn't create the invite", e?.message ?? "Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  async function applyLimit(cents: number | null) {
    setPickedLimit(cents);
    const ms = managers.filter((m) => m.role === "Manager");
    if (!ms.length) return;
    await run("limit", () => Promise.all(ms.map((m) => updateManager(prop!.id, m.principal, "Manager", cents))), "Couldn't update the limit");
  }

  const count = managers.length;

  return (
    <PushedScroll backLabel="Account" onBack={navigation.goBack} refreshing={data.loading && !!data.data} onRefresh={data.reload}>
      <Kicker style={{ marginTop: 12 }}>PEOPLE</Kicker>
      <Text style={[type.pageTitle, { marginTop: 10 }]}>
        {count === 0 ? "Only you have access" : `${count} ${count === 1 ? "person has" : "people have"} access`}
      </Text>
      <Text style={[type.body, { fontSize: 13, lineHeight: 20.8, marginTop: 9 }]}>
        Everything they do is logged on your behalf, and you can revoke access at any time.
      </Text>

      {pending.map((a) => (
        <Callout key={a.id} style={{ marginTop: 18 }}>
          <Kicker color={v3.ink} style={{ letterSpacing: 1.08 }}>WAITING ON YOU</Kicker>
          <Text style={{ fontFamily: family.body, fontSize: 14, lineHeight: 21.7, color: v3.ink, marginTop: 11 }}>
            {a.requesterName} wants to {a.description.charAt(0).toLowerCase() + a.description.slice(1).replace(/\.$/, "")} for {money(a.amountCents)}.
          </Text>
          <View style={{ flexDirection: "row", gap: 9, marginTop: 16 }}>
            <Pill label={`Approve ${money(a.amountCents)}`} variant="ink" loading={busy === `a${a.id}`}
              onPress={() => run(`a${a.id}`, () => respondToApproval(prop.id, a.id, true), "Couldn't approve")} />
            <Pill label="Decline" variant="outline" style={{ borderColor: "rgba(11,13,26,0.24)" }}
              onPress={() => run(`a${a.id}`, () => respondToApproval(prop.id, a.id, false), "Couldn't decline")} />
          </View>
        </Callout>
      ))}

      <Card style={{ marginTop: 14 }}>
        {data.error && !data.data ? <EmptyRow text="Couldn't load who has access." /> : null}
        {managers.map((m) => (
          <View key={m.principal} style={{ paddingVertical: 16, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: v3.lineSoft }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 13 }}>
              <View style={{ width: 38, height: 38, borderRadius: 100, backgroundColor: v3.lineSoft, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: family.displayBold, fontSize: 12, color: v3.muted }}>{initials(m.displayName)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: family.bodySemi, fontSize: 15, lineHeight: 19.5, color: v3.ink }}>{m.displayName}</Text>
                <Text style={{ fontFamily: family.body, fontSize: 11.5, lineHeight: 16, color: v3.muted, marginTop: 5 }}>{managerMeta(m)}</Text>
              </View>
              <Chip
                label={ROLE_CHIP[m.role]}
                color={m.role === "Viewer" ? v3.muted : v3.blue}
                bg={m.role === "Viewer" ? v3.field : v3.blueTint}
                border={m.role === "Viewer" ? v3.chipLine : v3.blueLine}
              />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
              <Pill label="Change role" variant="outline" small loading={busy === m.principal} onPress={() => changeRole(m)} />
              <Pill label="Revoke" variant="danger" small onPress={() => revoke(m)} />
            </View>
            <Text style={[type.meta, { fontSize: 11, lineHeight: 16.5, marginTop: 12 }]}>ADDED {shortDate(m.addedAt)}</Text>
          </View>
        ))}
        <Pressable
          onPress={() => setInviteOpen((o) => !o)}
          style={{ minHeight: 44, paddingVertical: 15, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 10 }}
          accessibilityRole="button"
        >
          <Text style={{ fontFamily: family.bodySemi, fontSize: 13.5, color: v3.blue }}>{inviteOpen ? "Cancel invite" : "+  Invite someone"}</Text>
        </Pressable>
        {inviteOpen && (
          <View style={{ padding: 18, backgroundColor: v3.field, borderTopWidth: 1, borderTopColor: v3.line }}>
            <Kicker>NAME</Kicker>
            <TextInput
              value={invName}
              onChangeText={setInvName}
              placeholder="Marcus, son"
              placeholderTextColor={v3.muted}
              accessibilityLabel="Invitee name"
              style={{ minHeight: 46, borderWidth: 1.5, borderColor: v3.chipLine, borderRadius: 12, backgroundColor: v3.surface, paddingVertical: 12, paddingHorizontal: 14, marginTop: 9, fontFamily: family.body, fontSize: 14, color: v3.ink }}
            />
            <Kicker style={{ marginTop: 16 }}>ROLE</Kicker>
            <View style={{ gap: 9, marginTop: 10 }}>
              {ROLES.map((r) => {
                const on = r.role === invRole;
                return (
                  <Pressable
                    key={r.role}
                    onPress={() => setInvRole(r.role)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={{ backgroundColor: on ? v3.ink : v3.surface, borderWidth: 2, borderColor: on ? v3.ink : v3.line, borderRadius: 16, padding: 14 }}
                  >
                    <Text style={{ fontFamily: family.displayBold, fontSize: 14.5, letterSpacing: -0.29, color: on ? v3.paper : v3.ink }}>{r.name}</Text>
                    <Text style={{ fontFamily: family.body, fontSize: 12, lineHeight: 18, color: on ? v3.paperDim : v3.muted, marginTop: 6 }}>{r.sub}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pill
              label={`Share ${ROLE_CHIP[invRole].toLowerCase()} invite`}
              block
              loading={busy === "invite"}
              style={{ marginTop: 16, minHeight: 48 }}
              onPress={sendInvite}
            />
            <Text style={[type.body, { fontSize: 11.5, textAlign: "center", marginTop: 10 }]}>Creates a private link that works for 90 days. Anyone with it can accept, so send it only to them.</Text>
          </View>
        )}
      </Card>

      <Card flat style={{ padding: 20, marginTop: 14 }}>
        <Kicker>SPEND LIMIT FOR MANAGERS</Kicker>
        <Text style={{ fontFamily: family.display, fontSize: 30, lineHeight: 32, letterSpacing: -1.2, color: v3.ink, marginTop: 12 }}>
          {current === "mixed" && pickedLimit === undefined ? "Varies" : spendLimitLabel(limit)}
        </Text>
        <Text style={[type.body, { lineHeight: 19.4, marginTop: 9 }]}>
          {limit == null
            ? "Managers act with no approval step. Everything is still logged on your behalf."
            : `Managers book freely under ${spendLimitLabel(limit)}. Anything above it waits for you.`}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 16 }}>
          {LIMITS.map((c) => {
            const on = c === limit && !(current === "mixed" && pickedLimit === undefined);
            return (
              <Pill
                key={String(c)}
                label={spendLimitLabel(c)}
                small
                variant={on ? "ink" : "outline"}
                style={{ paddingHorizontal: 15, backgroundColor: on ? v3.ink : v3.surface }}
                onPress={() => applyLimit(c)}
                loading={busy === "limit" && on}
              />
            );
          })}
        </View>
      </Card>

      <SectionLabel>ACTIVITY ON YOUR BEHALF</SectionLabel>
      <Card flat>
        {(data.data?.activity ?? []).length === 0 ? (
          <EmptyRow text={data.loading ? "Loading…" : "Nothing yet."} />
        ) : (
          data.data!.activity.slice(0, 20).map((n, i, arr) => (
            <View key={n.id} style={{ paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: v3.lineSoft, flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
              <Text style={{ width: 52, fontFamily: family.monoMedium, fontSize: 10, lineHeight: 14, letterSpacing: 0.6, color: v3.muted, paddingTop: 2 }}>{shortDate(n.timestamp)}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: family.bodyMedium, fontSize: 13.5, lineHeight: 19.6, color: v3.ink }}>{n.description}</Text>
                <Text style={[type.meta, { fontSize: 11, lineHeight: 15.4, marginTop: 5 }]}>{n.managerName.toUpperCase()} · ON YOUR BEHALF</Text>
              </View>
            </View>
          ))
        )}
      </Card>
    </PushedScroll>
  );
}
