/**
 * ListingNewPage — Bid to List H1 · /listing/new
 * Homeowner starts a sealed-bid listing request. Three fields and a photo
 * drop; the property record already exists so nothing here re-asks for it.
 */

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import ListingPhotoManager from "@/components/ListingPhotoManager";
import { listingService, type WindowDays } from "@/services/listing";
import { propertyService } from "@/services/property";
import { usePropertyStore } from "@/store/propertyStore";
import { useAuthStore } from "@/store/authStore";
import toast from "react-hot-toast";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";

const UI = V2_COLORS;
const CARD_SHADOW = "0 1px 3px rgba(11,13,26,0.05)";

const labelStyle: React.CSSProperties = {
  fontFamily: V2_FONTS.mono, fontSize: "0.72rem", fontWeight: 600,
  letterSpacing: "0.08em", color: UI.muted, textTransform: "uppercase",
};

const inputBase: React.CSSProperties = {
  marginTop: 9, border: `1.5px solid ${UI.border}`, background: UI.paper,
  borderRadius: V2_RADIUS.input + 4, padding: "14px 16px", boxSizing: "border-box",
  minHeight: 50, width: "100%", fontFamily: V2_FONTS.body, fontSize: "0.95rem",
  color: UI.ink, outline: "none",
};

const WINDOW_OPTIONS: { value: WindowDays; label: string }[] = [
  { value: "Three", label: "3 days" },
  { value: "Seven", label: "7 days" },
  { value: "Fourteen", label: "14 days" },
];

export default function ListingNewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { properties, setProperties } = usePropertyStore();
  const profile = useAuthStore((s) => s.profile);

  // Populate the property store if the user navigated here directly (bypassing Dashboard)
  useEffect(() => {
    if (properties.length === 0) {
      propertyService.getMyProperties().then((list) => { if (list.length > 0) setProperties(list); }).catch((e) => console.error("[ListingNew] property load failed:", e));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const propertyIdParam = searchParams.get("propertyId");
  const property = useMemo(
    () => properties.find((p) => String(p.id) === propertyIdParam) ?? properties[0] ?? null,
    [properties, propertyIdParam]
  );

  const [timeframe, setTimeframe] = useState("Within 60 days");
  const [notes, setNotes] = useState("");
  const [windowDays, setWindowDays] = useState<WindowDays>("Seven");
  const [photoCount, setPhotoCount] = useState(0);
  const [flaggedUnreviewed, setFlaggedUnreviewed] = useState(0);
  const [loading, setLoading] = useState(false);

  const propertyId = property ? String(property.id) : "";

  // Re-check flagged/unreviewed photo count whenever the photo list changes —
  // publish is blocked until every flagged tile has been reviewed (H1 spec).
  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    (async () => {
      const ids = await listingService.getListingPhotos(propertyId);
      const states = await Promise.all(ids.map((id) => listingService.getPhotoReviewState(id)));
      if (cancelled) return;
      setFlaggedUnreviewed(states.filter((s) => s?.flagged && !s.reviewed).length);
    })();
    return () => { cancelled = true; };
  }, [propertyId, photoCount]);

  async function handlePublish() {
    if (!property) { toast.error("No property on file to list"); return; }
    if (!timeframe.trim()) { toast.error("When do you want to list is required"); return; }
    if (flaggedUnreviewed > 0) { toast.error("Review the flagged photos before publishing"); return; }

    setLoading(true);
    try {
      const req = await listingService.createBidRequest({
        propertyId,
        address: property.address,
        city: property.city,
        county: "",
        zipCode: property.zipCode,
        homeownerEmail: profile?.email ?? "",
        sqft: property.squareFeet != null ? Number(property.squareFeet) : null,
        targetListDate: Date.now() + 60 * 86_400_000,
        desiredSalePrice: null,
        notes: `${timeframe} — ${notes}`.trim(),
        windowDays,
      });
      toast.success("Published to licensed agents.");
      navigate(`/listing/${req.id}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to publish listing request");
    } finally {
      setLoading(false);
    }
  }

  const checkRow = (ok: boolean, text: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: V2_FONTS.body, fontSize: "0.85rem", color: UI.ink }}>
      <span style={{
        width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
        background: ok ? UI.greenBg : UI.orangeBg, color: ok ? UI.green : UI.orange,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700,
      }}>{ok ? "✓" : "✕"}</span>
      {text}
    </div>
  );

  return (
    <Layout>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
        <button
          onClick={() => navigate(-1)}
          style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "none", border: "none", cursor: "pointer",
            fontFamily: V2_FONTS.mono, fontSize: "0.72rem", color: UI.muted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "1.5rem" }}
        >
          <ArrowLeft size={13} /> Back
        </button>

        <div style={{
          background: UI.paper, border: `1px solid ${UI.cardBorder}`, borderRadius: V2_RADIUS.card + 6,
          overflow: "hidden", boxShadow: CARD_SHADOW,
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)", gap: "clamp(24px,3vw,40px)", padding: "clamp(24px,3vw,36px)" }}>
            {/* Left column */}
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 22 }}>
              <div>
                <h1 style={{ fontFamily: V2_FONTS.display, fontWeight: 800, fontSize: "clamp(22px,2.4vw,26px)", letterSpacing: "-0.03em", color: UI.ink, margin: 0 }}>
                  Let agents compete for your listing
                </h1>
                <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.9375rem", color: UI.muted2, marginTop: 9 }}>
                  Up to five licensed agents bid on your home without knowing whose it is. You pay nothing, ever.
                  The agent you choose pays the platform fee — never you.
                </p>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <div style={labelStyle}>Property</div>
                  <div style={{ fontSize: "0.75rem", color: UI.muted, fontFamily: V2_FONTS.body }}>from your record</div>
                </div>
                <div style={{ ...inputBase, background: UI.surface, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    {property ? `${property.address}, ${property.city} ${property.zipCode}` : "No property on file"}
                  </div>
                  {property && (
                    <span style={{ fontFamily: V2_FONTS.mono, fontSize: "0.68rem", letterSpacing: "0.06em", color: UI.green, background: UI.greenBg, borderRadius: 100, padding: "6px 10px", whiteSpace: "nowrap" }}>
                      VERIFIED RECORD
                    </span>
                  )}
                </div>
                <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8125rem", color: UI.muted, marginTop: 7 }}>
                  Exact address is never shown to agents. They see the neighbourhood and zip only.
                </p>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <div style={labelStyle}>When do you want to list</div>
                  <div style={{ fontSize: "0.75rem", color: UI.muted, fontFamily: V2_FONTS.body }}>required</div>
                </div>
                <input
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  placeholder="Within 60 days"
                  style={{ ...inputBase, borderColor: UI.blue }}
                />
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <div style={labelStyle}>Anything agents should know</div>
                  <div style={{ fontSize: "0.75rem", color: UI.muted, fontFamily: V2_FONTS.body }}>optional · {180 - notes.length} left</div>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, 180))}
                  maxLength={180}
                  rows={3}
                  placeholder="Roof and HVAC both replaced in the last three years. Permits are clean."
                  style={{ ...inputBase, resize: "vertical", minHeight: 80 }}
                />
                <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8125rem", color: UI.muted, marginTop: 7 }}>
                  Scanned for contact details and address hints before it goes out.
                </p>
              </div>

              {property && (
                <div>
                  <div style={labelStyle}>Photos</div>
                  <div style={{ marginTop: 9 }}>
                    <ListingPhotoManager propertyId={propertyId} isOwner onPhotoCountChange={setPhotoCount} />
                  </div>
                  <div style={{ marginTop: 12, background: UI.amberBg, border: `1px solid ${UI.amberBorder}`, borderRadius: V2_RADIUS.card - 4, padding: "12px 14px" }}>
                    <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8125rem", color: UI.amberText, margin: 0 }}>
                      Photos are scanned for house numbers, street signs and mail before agents see them.
                      Anything identifying gets blurred automatically — review any flagged tile before you publish.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
              <div style={{ background: UI.neutralSurface, borderRadius: V2_RADIUS.card + 2, padding: 20 }}>
                <div style={{ ...labelStyle, color: UI.muted2, marginBottom: 12 }}>What agents will see</div>
                <div style={{ fontFamily: V2_FONTS.display, fontWeight: 700, fontSize: "1.05rem", color: UI.ink }}>
                  {property ? `${property.city} · ${property.zipCode}` : "—"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                  {checkRow(true, "Neighbourhood, zip, size and year built")}
                  {checkRow(true, "That a verified maintenance record exists")}
                  {checkRow(false, "Exact address")}
                  {checkRow(false, "Your name, photo or contact details")}
                </div>
              </div>

              <div>
                <div style={{ ...labelStyle, marginBottom: 10 }}>Bidding window</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {WINDOW_OPTIONS.map((opt) => {
                    const active = windowDays === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setWindowDays(opt.value)}
                        style={{
                          flex: 1, padding: "12px 8px", borderRadius: V2_RADIUS.input,
                          border: `1.5px solid ${active ? UI.blue : UI.border}`,
                          background: active ? UI.blueTintBg : UI.paper,
                          color: active ? UI.blue : UI.muted,
                          fontFamily: V2_FONTS.mono, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ background: UI.ink, borderRadius: V2_RADIUS.card + 2, padding: 22 }}>
                <div style={{ fontFamily: V2_FONTS.mono, fontSize: "0.68rem", letterSpacing: "0.08em", color: "rgba(252,252,253,0.6)", textTransform: "uppercase" }}>
                  Your cost
                </div>
                <div style={{ fontFamily: V2_FONTS.display, fontWeight: 800, fontSize: "2.1rem", color: UI.paper, margin: "6px 0 16px" }}>
                  $0
                </div>
                <Button
                  variant="primary"
                  style={{ width: "100%", minHeight: 48 }}
                  disabled={!property || flaggedUnreviewed > 0}
                  loading={loading}
                  onClick={handlePublish}
                  icon={!loading ? <Send size={15} /> : undefined}
                >
                  Publish to licensed agents
                </Button>
                {flaggedUnreviewed > 0 && (
                  <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.78rem", color: UI.greenBright, marginTop: 10, marginBottom: 0 }}>
                    {flaggedUnreviewed} photo{flaggedUnreviewed > 1 ? "s" : ""} need review before publishing.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
