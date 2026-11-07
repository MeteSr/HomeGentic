import React, { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Panel, Pill, SectionHeader, hudButtonStyle } from "@/components/hud";
import { floodZoneService, describeZone, femaMapUrl, type FloodZone } from "@/services/floodZone";
import { formatIsoDate } from "@/utils/format";

const BODY = "'Hanken Grotesk',sans-serif";
const muted: React.CSSProperties = { fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-muted)", margin: 0 };
const ink: React.CSSProperties = { fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-ink)", margin: 0 };

const dayOf = (ms: number) => formatIsoDate(new Date(ms).toISOString().slice(0, 10));

/**
 * #718: the FEMA flood zone at the home's address, from FEMA's National Flood
 * Hazard Layer. It says what FEMA's map shows and when; it isn't a forecast.
 */
export function FloodZoneCard({ propertyId, address }: { propertyId: string; address: string }) {
  const [zone, setZone] = useState<FloodZone | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    floodZoneService
      .get(propertyId)
      .then(setZone)
      .catch(() => setZone(null))
      .finally(() => setLoaded(true));
  }, [propertyId]);

  const lookUp = async (refresh: boolean) => {
    setBusy(true);
    setProblem(null);
    try {
      setZone(await floodZoneService.lookUp(propertyId, refresh));
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "The flood zone lookup failed. Try again in a few minutes.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel style={{ padding: "1.5rem" }}>
      <SectionHeader title="FEMA flood zone" sub="What FEMA's flood map shows at this address." />
      {!loaded && <p style={muted}>Loading…</p>}
      {loaded && zone && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {zone.status === "Mapped" ? (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <span
                style={{ ...ink, fontWeight: 600 }}
              >{`FEMA's map shows zone ${zone.zone} as of ${dayOf(zone.checkedAt)}`}</span>
              {zone.specialFloodHazardArea && <Pill tone="warn">Special flood hazard area</Pill>}
            </div>
          ) : (
            <span
              style={{ ...ink, fontWeight: 600 }}
            >{`FEMA's digital flood map shows no flood zone at this point as of ${dayOf(zone.checkedAt)}`}</span>
          )}
          <p style={ink}>{describeZone(zone)}</p>
          <span style={muted}>
            {[
              zone.zoneSubtype,
              zone.baseFloodElevation && `Base flood elevation ${zone.baseFloodElevation} ft`,
              zone.firmPanel &&
                `Map panel ${zone.firmPanel}${zone.firmEffectiveDate ? `, effective ${formatIsoDate(zone.firmEffectiveDate)}` : ""}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {zone.matchedAddress && <span style={muted}>Matched address: {zone.matchedAddress}</span>}
        </div>
      )}
      {loaded && !zone && (
        <p style={muted}>
          HomeGentic can look up the flood zone FEMA's map shows for this address. It uses the Census Bureau's address
          search and FEMA's public flood map.
        </p>
      )}
      <p style={{ ...muted, marginTop: "0.75rem" }}>
        FEMA's map is the official source; maps change and lenders and insurers make their own determinations. Have an
        elevation certificate? Keep it in Documents under "Elevation certificate".
      </p>
      {problem && (
        <p
          role="alert"
          style={{ fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-bad)", margin: "0.5rem 0 0" }}
        >
          {problem}
        </p>
      )}
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginTop: "1rem" }}>
        {loaded && (
          <Button
            disabled={busy}
            onClick={() => void lookUp(zone !== null)}
            style={hudButtonStyle(zone ? "outline" : "primary")}
          >
            {busy ? "Looking up…" : zone ? "Look again" : "Look up the FEMA flood zone"}
          </Button>
        )}
        <a
          href={femaMapUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-blue)" }}
        >
          Open FEMA's Flood Map Service Center
        </a>
      </div>
    </Panel>
  );
}
