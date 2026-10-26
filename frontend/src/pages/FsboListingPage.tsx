/**
 * FsboListingPage — Epic 10.3.1
 *
 * Public, unauthenticated page at /for-sale/:propertyId.
 * Shows list price, property details, HomeGentic score badge,
 * verified job summary, photo gallery, and a showing-request form.
 *
 * Everything comes from the live listing on the listing canister (address,
 * price, details, score, verified job count), plus the public report for the
 * address when the owner has shared one. A buyer's showing request goes to the
 * same canister, which notifies the seller.
 */

import React, { Suspense, lazy, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PageHead } from "@/components/PageHead";
import { ShieldCheck } from "lucide-react";
import { fsboService, type FsboPublicListing } from "@/services/fsbo";
import { reportService } from "@/services/report";
import ListingPhotoManager from "@/components/ListingPhotoManager";
import { listingService, type PanoramaEntry } from "@/services/listing";
import { showingRequestService } from "@/services/showingRequest";
import { V2_COLORS, V2_FONTS } from "@/theme";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { isValidEmailOrPhone } from "@/utils/validators";

// PlayCanvas is ~580 KB gzipped; load it only for listings that have panoramas.
const PlayCanvas360Viewer = lazy(() => import("@/components/PlayCanvas360Viewer"));

const UI = {
  ink:      V2_COLORS.ink,
  inkLight: V2_COLORS.muted,
  paper:    V2_COLORS.paper,
  rule:     V2_COLORS.border,
  sage:     V2_COLORS.blue,
  serif:    V2_FONTS.display,
  mono:     V2_FONTS.body,
  sans:     V2_FONTS.body,
};

function formatPrice(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatSqFt(sqFt: number): string {
  return Number(sqFt).toLocaleString("en-US");
}

function humanType(type: string): string {
  return type.replace(/([A-Z])/g, " $1").trim();
}

// ─── Showing-request form ─────────────────────────────────────────────────────

export function ShowingRequestForm({ propertyId }: { propertyId: string }) {
  const [name,    setName]    = useState("");
  const [contact, setContact] = useState("");
  const [time,    setTime]    = useState("");
  const [sent,    setSent]    = useState(false);
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const { isMobile } = useBreakpoint();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmailOrPhone(contact)) return;
    setSending(true);
    setError(null);
    try {
      await showingRequestService.create({ propertyId, name, contact, preferredTime: time });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send your request. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div style={{ padding: "1.25rem", background: "#f0faf4", border: "1px solid #c3e6cb", textAlign: "center" }}>
        <p style={{ fontFamily: UI.sans, fontWeight: 600, color: "#188038", margin: 0 }}>
          Request sent. The seller has your contact details and will reply to you directly.
        </p>
      </div>
    );
  }

  return (
    <form
      aria-label="Showing Request"
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
    >
      <div>
        <label
          htmlFor="sr-name"
          style={{ display: "block", fontFamily: UI.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: UI.inkLight, marginBottom: "0.25rem" }}
        >
          Your Name
        </label>
        <input
          id="sr-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ width: "100%", padding: "0.5rem", border: `1px solid ${UI.rule}`, fontFamily: UI.sans, fontSize: "0.875rem", boxSizing: "border-box" }}
        />
      </div>

      <div>
        <label
          htmlFor="sr-contact"
          style={{ display: "block", fontFamily: UI.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: UI.inkLight, marginBottom: "0.25rem" }}
        >
          Email or Phone
        </label>
        <input
          id="sr-contact"
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          required
          style={{ width: "100%", padding: "0.5rem", fontFamily: UI.sans, fontSize: "0.875rem", boxSizing: "border-box",
            border: `1px solid ${contact && !isValidEmailOrPhone(contact) ? V2_COLORS.coral : UI.rule}` }}
        />
        {contact && !isValidEmailOrPhone(contact) && (
          <p style={{ color: V2_COLORS.coral, fontSize: "0.7rem", marginTop: "0.25rem", fontFamily: V2_FONTS.body }}>Enter a valid email or phone number</p>
        )}
      </div>

      <div>
        <label
          htmlFor="sr-time"
          style={{ display: "block", fontFamily: UI.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: UI.inkLight, marginBottom: "0.25rem" }}
        >
          Preferred Showing Time
        </label>
        <input
          id="sr-time"
          type="text"
          placeholder="e.g. Weekday evenings, Saturday mornings"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          required
          style={{ width: "100%", padding: "0.5rem", border: `1px solid ${UI.rule}`, fontFamily: UI.sans, fontSize: "0.875rem", boxSizing: "border-box" }}
        />
      </div>

      {error && (
        <p role="alert" style={{ color: V2_COLORS.coral, fontSize: "0.8rem", margin: 0, fontFamily: V2_FONTS.body }}>{error}</p>
      )}

      <p style={{ fontFamily: UI.sans, fontSize: "0.75rem", color: UI.inkLight, margin: 0 }}>
        We pass your name, contact and preferred time to the seller, who replies to you directly.
      </p>

      <button
        type="submit"
        disabled={sending}
        style={{
          background:  UI.sage,
          color:       V2_COLORS.paper,
          border:      "none",
          padding:     "0.65rem 1.25rem",
          fontFamily:  UI.sans,
          fontWeight:  600,
          fontSize:    "0.875rem",
          cursor:      "pointer",
          alignSelf:   isMobile ? "stretch" : "flex-start",
        }}
      >
        {sending ? "Sending…" : "Request a Showing"}
      </button>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FsboListingPage() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const { isMobile } = useBreakpoint();

  const [loading,     setLoading]     = useState(true);
  const [listing,     setListing]     = useState<FsboPublicListing | null>(null);
  const [reportToken, setReportToken] = useState<string | null>(null);
  const [panoramas,   setPanoramas]   = useState<PanoramaEntry[]>([]);

  const displayAddress = listing?.address || (listing ? `${listing.city}, ${listing.state}` : "");

  const helmetTitle = listing
    ? `${displayAddress} — For Sale by Owner | HomeGentic™`
    : "For Sale by Owner | HomeGentic™";
  const helmetDesc = listing
    ? `${displayAddress} — $${(listing.listPriceCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} · ${listing.city}, ${listing.state}. Maintenance history on HomeGentic.`
    : "Browse FSBO listings with their maintenance history on HomeGentic.";

  useEffect(() => {
    if (!propertyId) { setLoading(false); return; }
    let cancelled = false;

    Promise.all([
      fsboService.getPublicListing(propertyId),
      listingService.getPanoramas(propertyId).catch(() => [] as PanoramaEntry[]),
    ]).then(async ([live, pans]) => {
      if (cancelled) return;
      setListing(live);
      setPanoramas(pans ?? []);
      setLoading(false);
      if (live?.hasPublicReport) {
        const match = await reportService.findPublicReport(`${live.address}, ${live.city}, ${live.state} ${live.zipCode}`).catch(() => null);
        if (!cancelled && match) setReportToken(match.token);
      }
    }).catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [propertyId]);

  const outerStyle: React.CSSProperties = {
    maxWidth: "860px",
    margin:   "0 auto",
    padding:  isMobile ? "1rem" : "2rem 1rem",
    fontFamily: UI.sans,
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <PageHead>
          <title>For Sale by Owner | HomeGentic</title>
          <meta name="description" content="Browse verified FSBO listings with blockchain-backed maintenance history on HomeGentic." />
          <meta property="og:title" content="For Sale by Owner | HomeGentic™" />
          <meta property="og:description" content="Verified FSBO listings on HomeGentic." />
          <meta property="og:type" content="website" />
          <meta property="og:image" content="https://homegentic.app/og-default.png" />
          <link rel="canonical" href="https://homegentic.app/for-sale" />
          <script type="application/ld+json">{JSON.stringify({ "@context": "https://schema.org", "@type": "RealEstateListing", "name": "For Sale by Owner | HomeGentic™", "description": "Verified FSBO listing on HomeGentic." })}</script>
        </PageHead>
        <div style={outerStyle}>
          <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: UI.mono, color: UI.inkLight }}>
            Loading…
          </div>
        </div>
      </>
    );
  }

  // ── Not for sale ───────────────────────────────────────────────────────────
  if (!listing) {
    return (
      <>
        <PageHead>
          <title>Not Listed For Sale | HomeGentic</title>
          <meta name="description" content="This property is not currently listed for sale via FSBO on HomeGentic." />
          <meta property="og:title" content="Not Listed For Sale | HomeGentic™" />
          <meta property="og:description" content="This property is not currently available via FSBO." />
          <meta property="og:type" content="website" />
          <meta property="og:image" content="https://homegentic.app/og-default.png" />
          <link rel="canonical" href="https://homegentic.app/for-sale" />
          <script type="application/ld+json">{JSON.stringify({ "@context": "https://schema.org", "@type": "RealEstateListing", "name": "For Sale by Owner | HomeGentic™", "description": "Verified FSBO listing on HomeGentic." })}</script>
        </PageHead>
        <div style={outerStyle}>
          <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "0.5rem" }}>
            <p style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.5rem", color: UI.ink }}>Not Listed For Sale</p>
            <p style={{ fontFamily: UI.sans, fontSize: "0.875rem", color: UI.inkLight }}>This property is not currently available via FSBO.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead>
        <title>{helmetTitle}</title>
        <meta name="description" content={helmetDesc} />
        <meta property="og:title" content={helmetTitle} />
        <meta property="og:description" content={helmetDesc} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://homegentic.app/for-sale/${propertyId}`} />
        <meta property="og:image" content="https://homegentic.app/og-default.png" />
        <link rel="canonical" href={`https://homegentic.app/for-sale/${propertyId}`} />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "RealEstateListing",
          "name": helmetTitle,
          "description": helmetDesc,
          "url": `https://homegentic.app/for-sale/${propertyId}`,
          "image": "https://homegentic.app/og-default.png",
        })}</script>
      </PageHead>
    <div style={outerStyle}>

      {/* ── Photo gallery ─────────────────────────────────────────────────── */}
      <div
        data-testid="listing-gallery-section"
        style={{ marginBottom: "1.5rem" }}
      >
        <ListingPhotoManager propertyId={propertyId!} isOwner={false} />
      </div>

      {/* ── 360° Virtual Tour (issue #308) ──────────────────────────────────── */}
      {panoramas.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "1.125rem", color: "#0e0e0c", margin: "0 0 0.75rem" }}>
            360° Virtual Tour
          </h2>
          <Suspense fallback={null}>
            <PlayCanvas360Viewer panoramas={panoramas} propertyId={propertyId!} />
          </Suspense>
        </div>
      )}

      {/* ── Price + address ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "2rem", color: UI.ink, marginBottom: "0.25rem" }}>
          {formatPrice(listing.listPriceCents)}
        </div>
        <div style={{ fontFamily: UI.sans, fontWeight: 600, fontSize: "1.15rem", color: UI.ink }}>
          {displayAddress}
        </div>
        <div style={{ fontFamily: UI.sans, fontSize: "0.95rem", color: UI.inkLight }}>
          {listing.city}, {listing.state} {listing.zipCode}
        </div>
      </div>

      {/* ── Details grid ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "1.5rem", borderTop: `1px solid ${UI.rule}`, borderBottom: `1px solid ${UI.rule}`, padding: "1rem 0" }}>
        {[
          { label: "Type",       value: humanType(listing.propertyType) },
          { label: "Bedrooms",   value: String(listing.bedrooms) },
          { label: "Bathrooms",  value: String(listing.bathrooms) },
          { label: "Year Built", value: String(listing.yearBuilt) },
          { label: "Sq Ft",      value: formatSqFt(listing.squareFeet) },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: UI.inkLight, marginBottom: "0.15rem" }}>{label}</div>
            <div style={{ fontFamily: UI.sans, fontWeight: 600, fontSize: "0.95rem", color: UI.ink }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Seller description ──────────────────────────────────────────────── */}
      {listing.description && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: UI.inkLight, marginBottom: "0.5rem" }}>
            About This Home
          </div>
          <p style={{ fontFamily: UI.sans, fontSize: "0.95rem", color: UI.ink, lineHeight: 1.65, margin: 0 }}>
            {listing.description}
          </p>
        </div>
      )}

      {/* ── HomeGentic score badge (hidden when the seller opted out) ─────────── */}
      {listing.score != null && (
        <section
          aria-label="HomeGentic Score"
          style={{ border: `1.5px solid ${UI.sage}`, padding: "1rem 1.25rem", marginBottom: "1.5rem", background: V2_COLORS.lblue }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
            <div style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "2.5rem", color: UI.ink, lineHeight: 1 }}>
              {listing.score}
            </div>
            <div>
              <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: UI.inkLight, marginBottom: "0.15rem" }}>
                HomeGentic Score
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontFamily: UI.mono, fontSize: "0.65rem", color: UI.sage }}>
                <ShieldCheck size={13} />
                Calculated by HomeGentic from this home's records
              </div>
            </div>
          </div>
          <p style={{ fontFamily: UI.sans, fontSize: "0.78rem", color: UI.inkLight, margin: 0 }}>
            Maintenance data is stored on-chain. Jobs signed off by both homeowner and contractor can't be edited afterwards.
          </p>
        </section>
      )}

      {/* ── Verified jobs summary ────────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: UI.inkLight, marginBottom: "0.5rem" }}>
          Maintenance Record
        </div>
        <div style={{ fontFamily: UI.sans, fontSize: "0.875rem", color: UI.ink, marginBottom: "0.5rem" }}>
          <strong>{listing.verifiedJobCount} verified</strong> maintenance job{listing.verifiedJobCount !== 1 ? "s" : ""} on record
        </div>
        {(listing.systemHighlights ?? []).length > 0 && (
          <ul style={{ margin: 0, padding: "0 0 0 1.1rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            {listing.systemHighlights!.map((h) => (
              <li key={h} style={{ fontFamily: UI.sans, fontSize: "0.8rem", color: UI.inkLight }}>{h}</li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Full report link (10.3.3) ───────────────────────────────────────── */}
      {reportToken && (
        <div style={{ marginBottom: "1.5rem" }}>
          <a
            href={`/report/${reportToken}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: UI.sans, fontWeight: 600, fontSize: "0.875rem", color: UI.sage, textDecoration: "underline" }}
          >
            View Full Maintenance History
          </a>
        </div>
      )}

      {/* ── Showing request ─────────────────────────────────────────────────── */}
      <div style={{ border: `1px solid ${UI.rule}`, padding: "1.5rem" }}>
        <h2 style={{ fontFamily: UI.serif, fontWeight: 700, fontSize: "1.1rem", color: UI.ink, margin: "0 0 1rem" }}>
          Schedule a Showing
        </h2>
        <ShowingRequestForm propertyId={propertyId!} />
      </div>
    </div>
    </>
  );
}
