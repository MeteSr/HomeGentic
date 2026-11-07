import React from "react";
import type { HouseGuide } from "@/services/houseGuide";

const BODY = "'Hanken Grotesk',sans-serif";
const labelText: React.CSSProperties = {
  fontFamily: BODY,
  fontSize: "0.65rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--hg-muted)",
};
const value: React.CSSProperties = {
  fontFamily: BODY,
  fontSize: "0.9375rem",
  color: "var(--hg-ink)",
  marginTop: 2,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

export interface GuidePhoto {
  id: string;
  url: string;
  label: string;
}

function Item({ label, text }: { label: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <div>
      <div style={labelText}>{label}</div>
      <div style={value}>{text}</div>
    </div>
  );
}

/**
 * #725: a house guide laid out for reading, on the property page and on the
 * shared /guide/:token page. Parts left blank are left out.
 */
export function HouseGuideView({ guide, photos }: { guide: HouseGuide; photos: GuidePhoto[] }) {
  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "1rem",
  };
  const section = (title: string, children: React.ReactNode) => (
    <section style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <h3 style={{ fontFamily: BODY, fontSize: "0.875rem", fontWeight: 700, color: "var(--hg-ink)", margin: 0 }}>
        {title}
      </h3>
      {children}
    </section>
  );
  const hasWifi = guide.wifiName.trim() || guide.wifiPassword.trim();
  const hasBins = guide.trashDay.trim() || guide.recyclingDay.trim();
  const hasShutoffs =
    guide.waterShutoff.trim() || guide.gasShutoff.trim() || guide.electricPanel.trim() || photos.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {hasWifi &&
        section(
          "Wi-Fi",
          <div style={grid}>
            <Item label="Network" text={guide.wifiName} />
            <Item label="Password" text={guide.wifiPassword} />
          </div>,
        )}
      {guide.alarm.trim() && section("Alarm", <div style={value}>{guide.alarm}</div>)}
      {hasBins &&
        section(
          "Trash and recycling",
          <div style={grid}>
            <Item label="Trash" text={guide.trashDay} />
            <Item label="Recycling" text={guide.recyclingDay} />
          </div>,
        )}
      {hasShutoffs &&
        section(
          "Shutoffs",
          <>
            <div style={grid}>
              <Item label="Water" text={guide.waterShutoff} />
              <Item label="Gas" text={guide.gasShutoff} />
              <Item label="Electrical panel" text={guide.electricPanel} />
            </div>
            {photos.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                {photos.map((p) => (
                  <figure key={p.id} style={{ margin: 0, width: 160 }}>
                    {p.url ? (
                      <img
                        src={p.url}
                        alt={p.label}
                        style={{
                          width: 160,
                          height: 120,
                          objectFit: "cover",
                          borderRadius: 10,
                          border: "1px solid var(--hg-line)",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 160,
                          height: 120,
                          borderRadius: 10,
                          border: "1px dashed var(--hg-line-2)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: BODY,
                          fontSize: "0.75rem",
                          color: "var(--hg-muted)",
                          textAlign: "center",
                          padding: 8,
                        }}
                      >
                        Photo not available
                      </div>
                    )}
                    <figcaption
                      style={{ fontFamily: BODY, fontSize: "0.75rem", color: "var(--hg-muted)", marginTop: 4 }}
                    >
                      {p.label}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </>,
        )}
      {guide.contacts.length > 0 &&
        section(
          "Who to call",
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            {guide.contacts.map((c, i) => (
              <li key={i} style={{ fontFamily: BODY, fontSize: "0.9375rem", color: "var(--hg-ink)" }}>
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                {c.role && <span style={{ color: "var(--hg-muted)" }}> · {c.role}</span>}
                {c.phone && (
                  <>
                    {" · "}
                    <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} style={{ color: "var(--hg-blue-ink)" }}>
                      {c.phone}
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>,
        )}
      {guide.notes.trim() && section("Notes", <div style={value}>{guide.notes}</div>)}
    </div>
  );
}
