/**
 * Storm and emergency card (#715): one printable page per home with its
 * shutoffs (and the onboarding photos of them), alarm, insurer claim line and
 * the people to call, built from the house guide, setup photos and insurance
 * policy. Homes in hurricane states also get a before-the-storm checklist
 * (ticks kept on this device) and after-the-storm steps into the claim kit.
 *
 * Copy limit: practical steps only; life-safety decisions are left to local
 * emergency officials, and the page links official sources.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Phone, Printer, Siren } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Panel } from "@/components/hud";
import { SHELL_PAGE_MIN_HEIGHT } from "@/components/dashboardV3/chrome";
import { propertyService, type Property } from "@/services/property";
import { houseGuideService, isBaselinePhoto, type HouseGuide } from "@/services/houseGuide";
import { insurancePolicyService, type InsurancePolicy } from "@/services/insurancePolicy";
import { photoService, type Photo } from "@/services/photo";
import {
  buildEmergencyCard,
  isHurricaneZone,
  isHurricaneSeason,
  officialSources,
  stormPrepKey,
  telHref,
  PRE_STORM_CHECKLIST,
  AFTER_STORM_STEPS,
  type EmergencyContact,
} from "@homegentic/shared/emergency";

const MONO = "'JetBrains Mono',monospace";
const SERIF = "'Bricolage Grotesque',system-ui,sans-serif";
const BODY = "'Hanken Grotesk',sans-serif";

const kicker: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: "0.6rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--hg-muted)",
  margin: "0 0 0.5rem",
};
const h2: React.CSSProperties = {
  fontFamily: SERIF,
  fontWeight: 700,
  fontSize: "1.1rem",
  color: "var(--hg-ink)",
  margin: "0 0 0.75rem",
};
const body: React.CSSProperties = {
  fontFamily: BODY,
  fontSize: "0.9rem",
  color: "var(--hg-ink-2)",
  lineHeight: 1.55,
  margin: 0,
};
const linkStyle: React.CSSProperties = {
  fontFamily: BODY,
  fontSize: "0.875rem",
  fontWeight: 600,
  color: "var(--hg-blue-ink)",
};
const button = (primary: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontFamily: BODY,
  fontSize: "0.875rem",
  fontWeight: 600,
  color: primary ? "#FCFCFD" : "var(--hg-ink)",
  background: primary ? "var(--hg-bad)" : "var(--hg-fill)",
  border: primary ? "none" : "1px solid var(--hg-line-2)",
  borderRadius: 100,
  padding: "0.55rem 1.1rem",
  cursor: "pointer",
});
const card: React.CSSProperties = { padding: "1.25rem", marginBottom: "1rem", breakInside: "avoid" };

function readTicks(key: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function CallLink({ phone, label }: { phone: string; label: string }) {
  const href = telHref(phone);
  if (!href) return <span style={body}>{phone}</span>;
  return (
    <a
      href={href}
      aria-label={`${label} ${phone}`}
      style={{ ...linkStyle, display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      <Phone size={13} aria-hidden /> {phone}
    </a>
  );
}

export default function EmergencyCardPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [property, setProperty] = useState<Property | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [guide, setGuide] = useState<HouseGuide | null>(null);
  const [policy, setPolicy] = useState<InsurancePolicy | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [partial, setPartial] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    const failed = () => live && setPartial(true);
    Promise.all([
      propertyService.getProperty(id).catch(() => null),
      houseGuideService.get(id).catch(() => (failed(), null)),
      insurancePolicyService.get(id).catch(() => (failed(), null)),
      // The guide can only show setup photos, so these are all the card needs.
      photoService.getByJob(`baseline_${id}`).catch(() => (failed(), [] as Photo[])),
    ]).then(([p, g, pol, ph]) => {
      if (!live) return;
      setProperty(p);
      setNotFound(p === null);
      setGuide(g);
      setPolicy(pol);
      setPhotos(ph);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [id]);

  const now = new Date();
  const prepKey = stormPrepKey(id, now);
  const [ticks, setTicks] = useState<string[]>(() => readTicks(prepKey));
  const toggle = (itemId: string) => {
    setTicks((prev) => {
      const next = prev.includes(itemId) ? prev.filter((x) => x !== itemId) : [...prev, itemId];
      try {
        localStorage.setItem(prepKey, JSON.stringify(next));
      } catch {
        /* private mode: ticks last for this visit only */
      }
      return next;
    });
  };

  const baseline = useMemo(() => photos.filter(isBaselinePhoto), [photos]);
  const emergency = useMemo(() => buildEmergencyCard({ guide, policy, photos: baseline }), [guide, policy, baseline]);
  const photoUrl = (photoId: string) => photos.find((p) => p.id === photoId)?.url ?? "";

  const address = property ? `${property.address}, ${property.city}, ${property.state} ${property.zipCode}` : "";
  const stormState = property ? isHurricaneZone(property.state) : false;
  const inSeason = isHurricaneSeason(now);
  const guideHref = `/properties/${id}?tab=guide`;
  const insuranceHref = `/properties/${id}?tab=insurance`;
  const emergencyQuote = () =>
    navigate("/quotes/new", { state: { prefill: { propertyId: id, urgency: "emergency" } } });

  const contactRow = (c: EmergencyContact, i: number) => (
    <li
      key={`${c.name}-${i}`}
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        padding: "0.5rem 0",
        borderTop: i ? "1px solid var(--hg-line)" : "none",
      }}
    >
      <span style={body}>
        <strong style={{ color: "var(--hg-ink)" }}>{c.name}</strong>
        {c.role && <span style={{ color: "var(--hg-muted)" }}> · {c.role}</span>}
      </span>
      {c.phone && <CallLink phone={c.phone} label={`Call ${c.name}`} />}
    </li>
  );

  return (
    <Layout>
      <div
        className="hg-v3"
        data-theme="light"
        data-emergency-card
        style={{ background: "var(--hg-bg)", minHeight: SHELL_PAGE_MIN_HEIGHT, padding: "28px clamp(16px, 4vw, 32px)" }}
      >
        <div style={{ maxWidth: "52rem", margin: "0 auto" }}>
          <Link
            to={`/properties/${id}`}
            className="no-print"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: MONO,
              fontSize: "0.65rem",
              letterSpacing: "0.06em",
              color: "var(--hg-muted)",
              textDecoration: "none",
              marginBottom: "1rem",
            }}
          >
            <ArrowLeft size={12} aria-hidden /> Back to property
          </Link>

          <h1
            style={{
              fontFamily: SERIF,
              fontWeight: 800,
              fontSize: "1.75rem",
              color: "var(--hg-ink)",
              margin: "0 0 0.25rem",
            }}
          >
            Emergency card
          </h1>
          {address && <p style={{ ...body, color: "var(--hg-muted)", marginBottom: "1rem" }}>{address}</p>}

          {!loaded ? (
            <p style={{ fontFamily: MONO, fontSize: "0.7rem", color: "var(--hg-muted)" }}>Loading…</p>
          ) : notFound ? (
            <Panel style={card}>
              <p style={body}>We couldn't find that home.</p>
            </Panel>
          ) : (
            <>
              <div className="no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: "1.25rem" }}>
                <button type="button" onClick={emergencyQuote} style={button(true)}>
                  <Siren size={15} aria-hidden /> Get emergency help
                </button>
                <button type="button" onClick={() => window.print()} style={button(false)}>
                  <Printer size={15} aria-hidden /> Print
                </button>
              </div>
              <p
                className="no-print"
                style={{ ...body, fontSize: "0.8rem", color: "var(--hg-muted)", marginBottom: "1rem" }}
              >
                "Get emergency help" starts a quote request for this home with its urgency set to Emergency.
              </p>

              {partial && (
                <p role="status" style={{ ...body, color: "var(--hg-bad)", marginBottom: "1rem" }}>
                  Part of this card couldn't load. Reload the page to try again.
                </p>
              )}

              {emergency.missing.length > 0 && (
                <Panel style={card}>
                  <section aria-labelledby="ec-missing" className="no-print">
                    <h2 id="ec-missing" style={h2}>
                      Not on this card yet
                    </h2>
                    <ul style={{ ...body, paddingLeft: "1.1rem", margin: "0 0 0.75rem" }}>
                      {emergency.missing.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <Link to={guideHref} style={linkStyle}>
                        Fill in the house guide
                      </Link>
                      {!policy && (
                        <Link to={insuranceHref} style={linkStyle}>
                          Add your policy
                        </Link>
                      )}
                    </div>
                  </section>
                </Panel>
              )}

              <Panel style={card}>
                <section aria-labelledby="ec-shutoffs">
                  <h2 id="ec-shutoffs" style={h2}>
                    Shutoffs
                  </h2>
                  {emergency.shutoffs.map((s, i) => (
                    <div
                      key={s.key}
                      style={{
                        display: "flex",
                        gap: 14,
                        alignItems: "flex-start",
                        padding: "0.6rem 0",
                        borderTop: i ? "1px solid var(--hg-line)" : "none",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={kicker}>{s.label}</p>
                        <p
                          style={{
                            ...body,
                            color: s.where ? "var(--hg-ink)" : "var(--hg-muted)",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {s.where || "Not written down yet"}
                        </p>
                      </div>
                      {s.photoId && photoUrl(s.photoId) && (
                        <img
                          src={photoUrl(s.photoId)}
                          alt={s.label}
                          style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
                        />
                      )}
                    </div>
                  ))}
                  {emergency.otherPhotoIds.some((p) => photoUrl(p)) && (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: "0.75rem" }}>
                      {emergency.otherPhotoIds
                        .filter((p) => photoUrl(p))
                        .map((p) => (
                          <img
                            key={p}
                            src={photoUrl(p)}
                            alt="Photo from the house guide"
                            style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8 }}
                          />
                        ))}
                    </div>
                  )}
                </section>
              </Panel>

              {emergency.alarm && (
                <Panel style={card}>
                  <section aria-labelledby="ec-alarm">
                    <h2 id="ec-alarm" style={h2}>
                      Alarm
                    </h2>
                    <p style={{ ...body, whiteSpace: "pre-wrap" }}>{emergency.alarm}</p>
                  </section>
                </Panel>
              )}

              {emergency.insurer && (
                <Panel style={card}>
                  <section aria-labelledby="ec-insurer">
                    <h2 id="ec-insurer" style={h2}>
                      Insurance
                    </h2>
                    <div
                      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))", gap: 12 }}
                    >
                      <div>
                        <p style={kicker}>Insurer</p>
                        <p style={{ ...body, color: "var(--hg-ink)" }}>{emergency.insurer.carrier}</p>
                      </div>
                      {emergency.insurer.policyNumber && (
                        <div>
                          <p style={kicker}>Policy number</p>
                          <p style={{ ...body, color: "var(--hg-ink)", fontFamily: MONO }}>
                            {emergency.insurer.policyNumber}
                          </p>
                        </div>
                      )}
                      <div>
                        <p style={kicker}>Claim line</p>
                        {emergency.insurer.claimLine?.phone ? (
                          <CallLink phone={emergency.insurer.claimLine.phone} label="Call the claim line" />
                        ) : (
                          <p style={{ ...body, color: "var(--hg-muted)" }}>
                            Not saved. Add it as a house guide contact with the role "Insurance claims".
                          </p>
                        )}
                      </div>
                    </div>
                  </section>
                </Panel>
              )}

              {emergency.contacts.length > 0 && (
                <Panel style={card}>
                  <section aria-labelledby="ec-contacts">
                    <h2 id="ec-contacts" style={h2}>
                      People to call
                    </h2>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>{emergency.contacts.map(contactRow)}</ul>
                  </section>
                </Panel>
              )}

              {stormState && (
                <>
                  <Panel style={card}>
                    <section aria-labelledby="ec-before">
                      <h2 id="ec-before" style={h2}>
                        Before a storm
                      </h2>
                      <p style={{ ...body, marginBottom: "0.75rem" }}>
                        {inSeason
                          ? "It's hurricane season (June 1 to November 30). Work through this list before a storm is forecast."
                          : "Hurricane season runs June 1 to November 30. Work through this list before it starts."}
                      </p>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {PRE_STORM_CHECKLIST.map((item) => (
                          <li key={item.id} style={{ padding: "0.3rem 0" }}>
                            <label
                              style={{ ...body, display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}
                            >
                              <input
                                type="checkbox"
                                checked={ticks.includes(item.id)}
                                onChange={() => toggle(item.id)}
                                style={{ marginTop: 4, flexShrink: 0 }}
                              />
                              <span>{item.text}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      <p
                        className="no-print"
                        style={{ ...body, fontSize: "0.8rem", color: "var(--hg-muted)", marginTop: "0.5rem" }}
                      >
                        Ticks are saved on this device and start fresh each year.
                      </p>
                    </section>
                  </Panel>

                  <Panel style={card}>
                    <section aria-labelledby="ec-after">
                      <h2 id="ec-after" style={h2}>
                        After a storm
                      </h2>
                      <ol style={{ ...body, paddingLeft: "1.2rem", margin: "0 0 0.75rem" }}>
                        {AFTER_STORM_STEPS.map((s) => (
                          <li key={s.id} style={{ padding: "0.2rem 0" }}>
                            {s.text}
                          </li>
                        ))}
                      </ol>
                      <div className="no-print" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <Link to={insuranceHref} style={linkStyle}>
                          Open the claim kit
                        </Link>
                      </div>
                    </section>
                  </Panel>

                  <Panel style={card}>
                    <section aria-labelledby="ec-official">
                      <h2 id="ec-official" style={h2}>
                        Official sources
                      </h2>
                      <p style={{ ...body, marginBottom: "0.5rem" }}>
                        Follow local emergency officials for evacuation orders, shelters and when it's safe to go back.
                      </p>
                      <ul style={{ ...body, paddingLeft: "1.1rem", margin: 0 }}>
                        {officialSources(property?.state ?? "").map((s) => (
                          <li key={s.url}>
                            <a href={s.url} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                              {s.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </Panel>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
