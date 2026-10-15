import React from "react";
import { Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAppData } from "../../context/AppData";
import { useLoad } from "../../hooks/useLoad";
import {
  getManagers, getRooms, Property, propertyTypeLabel, Room,
  verificationChip, verificationDocChip,
} from "../../services/propertyService";
import { getSensorSummaries } from "../../services/upkeepService";
import { Card, Chip, chipTone, EmptyRow, IconTile, Kicker, PageHeader, Row, SectionLabel, TabScroll } from "../../components/ui";
import { NoProperty } from "./NoProperty";
import { family, type, v3 } from "../../theme";

const METHOD: Record<string, string> = {
  DeedRecord:  "the county deed record",
  TaxRecord:   "the county tax record",
  UtilityBill: "a utility bill in your name",
};

export function ownershipLine(p: Property, sharedWith: number | null): string {
  let line: string;
  switch (p.verificationLevel) {
    case "Premium":
    case "Basic":
      line = `Ownership verified against ${METHOD[p.verificationMethod ?? ""] ?? "your ownership documents"}.`;
      break;
    case "PendingReview":
      line = "Your ownership documents are in review.";
      break;
    default:
      line = "Ownership isn't verified yet. Verifying on homegentic.app adds up to 10 points.";
  }
  if (sharedWith != null && sharedWith > 0) line += ` Shared with ${sharedWith} ${sharedWith === 1 ? "person" : "people"}.`;
  return line;
}

/** "9 ITEMS · 7 DOCUMENTED"; complete when every fixture has brand, model and install date. */
export function roomSummary(r: Room): { meta: string; complete: boolean } {
  const documented = r.fixtures.filter((f) => f.brand && f.model && f.installedDate).length;
  const n = r.fixtures.length;
  return {
    meta:     n === 0 ? `${r.floorName ? r.floorName.toUpperCase() + " · " : ""}NO ITEMS YET` : `${n} ${n === 1 ? "ITEM" : "ITEMS"} · ${documented} DOCUMENTED`,
    complete: n > 0 && documented === n,
  };
}

export default function PropertyScreen() {
  const app = useAppData();
  const navigation = useNavigation<any>();
  const prop = app.activeProperty;

  const data = useLoad(async () => {
    if (!prop) return null;
    const [rooms, sensors, managers] = await Promise.all([
      getRooms(prop.id).catch(() => null),
      getSensorSummaries(prop.id).catch(() => []),
      app.pro ? getManagers(prop.id).catch(() => null) : Promise.resolve(null),
    ]);
    return { rooms, sensors, sharedWith: managers ? managers.length : null };
  }, `${prop?.id}:${app.pro}`);

  if (app.propertiesLoaded && !prop) return <TabScroll><NoProperty /></TabScroll>;
  if (!prop) return <TabScroll><PageHeader kicker="PROPERTY" title=" " /></TabScroll>;

  const verified = prop.verificationLevel === "Premium" || prop.verificationLevel === "Basic";
  const docChip  = verificationDocChip(prop.verificationMethod);
  const addr     = { propertyId: prop.id, propertyAddress: prop.address };

  const records = [
    { abbr: "JB", label: "Log a job",             sub: "Contractor or DIY",                                   go: () => navigation.navigate("LogJob", addr) },
    { abbr: "PH", label: "Add photos",            sub: `Up to ${app.limits.photosPerJob} per job${app.pro ? "" : " on Free"}`, go: () => navigation.navigate("PropertyDetail", { property: prop }) },
    { abbr: "UB", label: "Upload a utility bill", sub: "Reads usage and cost",                                go: () => navigation.navigate("BillUpload", addr) },
    { abbr: "SC", label: "Scan a document",       sub: "Manuals and warranties",                              go: () => navigation.navigate("ScanDocument", addr) },
  ];

  const rooms   = data.data?.rooms;
  const sensors = data.data?.sensors ?? [];

  return (
    <TabScroll refreshing={data.loading && !!data.data} onRefresh={data.reload}>
      <PageHeader kicker="PROPERTY" title={prop.street} onTitlePress={app.openProps} />

      <Card style={{ padding: 20 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip
            label={verificationChip(prop.verificationLevel)}
            color={verified ? v3.blue : v3.muted}
            bg={verified ? v3.blueTint : "transparent"}
            border={verified ? v3.blueLine : v3.chipLine}
            style={{ paddingVertical: 6 }}
          />
          {docChip && <Chip label={docChip} border={v3.chipLine} />}
        </View>
        <Text style={[type.meta, { fontSize: 12, lineHeight: 18, marginTop: 14 }]}>
          {[
            prop.squareFeet ? `${prop.squareFeet.toLocaleString("en-US")} SQ FT` : null,
            prop.yearBuilt ? `BUILT ${prop.yearBuilt}` : null,
            propertyTypeLabel(prop.propertyType),
          ].filter(Boolean).join(" · ")}
        </Text>
        <Text style={[type.body, { lineHeight: 19.4, marginTop: 10 }]}>{ownershipLine(prop, data.data?.sharedWith ?? null)}</Text>
      </Card>

      <SectionLabel>ADD TO THE RECORD</SectionLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {records.map((r) => (
          <Pressable
            key={r.abbr}
            onPress={r.go}
            accessibilityRole="button"
            accessibilityLabel={r.label}
            style={({ pressed }) => ({
              width: "48.4%",
              flexGrow: 1,
              minHeight: 44,
              backgroundColor: v3.surface,
              borderWidth: 1,
              borderColor: v3.line,
              borderRadius: 18,
              padding: 15,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <IconTile abbr={r.abbr} size={30} bg={v3.blueTint} color={v3.blue} />
            <Text style={{ fontFamily: family.bodySemi, fontSize: 13.5, lineHeight: 17.5, color: v3.ink, marginTop: 12 }}>{r.label}</Text>
            <Text style={{ fontFamily: family.body, fontSize: 11, lineHeight: 15.4, color: v3.muted, marginTop: 4 }}>{r.sub}</Text>
          </Pressable>
        ))}
      </View>

      <SectionLabel>ROOMS & FINISHES</SectionLabel>
      <Card>
        {rooms == null ? (
          <EmptyRow text={data.loading ? "Loading…" : "Couldn't load rooms."} />
        ) : rooms.length === 0 ? (
          <EmptyRow text="No rooms yet. Add rooms, paint and fixtures on homegentic.app." />
        ) : (
          rooms.map((r, i) => {
            const sum = roomSummary(r);
            const tone = sum.complete ? chipTone.blue : chipTone.muted;
            return (
              <Row key={r.id} last={i === rooms.length - 1}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={type.rowTitle}>{r.name}</Text>
                  <Text style={[type.meta, { marginTop: 5 }]}>{sum.meta}</Text>
                </View>
                <Chip label={sum.complete ? "COMPLETE" : "GAPS"} color={tone.color} bg={tone.bg} />
              </Row>
            );
          })
        )}
      </Card>

      <SectionLabel>SENSORS</SectionLabel>
      {sensors.length === 0 ? (
        <Card flat><EmptyRow text={data.loading ? "Loading…" : "No sensors connected. Connect Nest, Moen Flo and others on homegentic.app."} /></Card>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 11 }}>
          {sensors.map((sn) => (
            <View key={sn.id} style={{ flexGrow: 1, flexBasis: "45%", minWidth: 0, backgroundColor: v3.surface, borderWidth: 1, borderColor: v3.line, borderRadius: 20, padding: 16 }}>
              <Kicker style={{ fontSize: 8.5, letterSpacing: 1.02 }}>{sn.label}</Kicker>
              <Text style={{ fontFamily: family.displayBold, fontSize: 17, lineHeight: 18.7, letterSpacing: -0.34, color: v3.ink, marginTop: 11 }}>{sn.value}</Text>
              <Text style={{ fontFamily: family.body, fontSize: 11.5, lineHeight: 16, color: sn.alert ? v3.red : v3.muted, marginTop: 7 }}>{sn.note}</Text>
            </View>
          ))}
        </View>
      )}
    </TabScroll>
  );
}
