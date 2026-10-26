/**
 * ContractorPro portfolio: co-signed jobs a contractor features on their
 * public profile with their own write-up (contractor.setPortfolio). Only
 * jobs a homeowner signed off on can be featured, because each entry names
 * one of the contractor's JobCredentials. The canister refuses a save without
 * ContractorPro; the public page shows the section only while the contractor
 * still has it.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/Button";
import { contractorService, type JobCredential, type PortfolioItem } from "@/services/contractor";
import { V2_COLORS, V2_FONTS } from "@/theme";

const MONO = V2_FONTS.body;
export const MAX_PORTFOLIO_ENTRIES = 12;

const monthYear = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", year: "numeric" });

/** The public "Featured work" section. */
export function FeaturedWork({ items }: { items: PortfolioItem[] }) {
  if (items.length === 0) return null;
  return (
    <div data-testid="featured-work" style={{ border: `1px solid ${V2_COLORS.border}`, background: V2_COLORS.paper, marginBottom: "1.5rem" }}>
      <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${V2_COLORS.border}` }}>
        <p style={{ fontFamily: MONO, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: V2_COLORS.muted, margin: 0 }}>
          Featured work
        </p>
        <p style={{ fontFamily: MONO, fontSize: "0.65rem", color: V2_COLORS.muted, margin: "0.25rem 0 0" }}>
          Jobs the homeowner co-signed on HomeGentic, described by the contractor.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "1rem" }}>
        {items.map((it) => (
          <div key={it.credentialId} style={{ border: `1px solid ${V2_COLORS.border}`, padding: "0.875rem 1.25rem" }}>
            <p style={{ fontFamily: V2_FONTS.display, fontWeight: 700, fontSize: "0.95rem", margin: 0 }}>{it.title}</p>
            <p style={{ fontFamily: MONO, fontSize: "0.6rem", letterSpacing: "0.06em", color: V2_COLORS.muted, margin: "0.2rem 0 0" }}>
              {it.serviceType} · co-signed {monthYear(it.verifiedAt)}
            </p>
            {it.description && (
              <p style={{ fontSize: "0.85rem", lineHeight: 1.55, color: V2_COLORS.ink, margin: "0.5rem 0 0", whiteSpace: "pre-wrap" }}>{it.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface Draft { featured: boolean; title: string; description: string }

/** The contractor's own editor, on their profile page. */
export function PortfolioEditor({ contractorId, isPro }: { contractorId: string; isPro: boolean }) {
  const [creds, setCreds]   = useState<JobCredential[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      contractorService.getCredentials(contractorId).catch(() => [] as JobCredential[]),
      contractorService.getPortfolio(contractorId).catch(() => [] as PortfolioItem[]),
    ]).then(([cs, items]) => {
      setCreds(cs.slice().sort((a, b) => b.verifiedAt - a.verifiedAt));
      const d: Record<number, Draft> = {};
      for (const it of items) d[it.credentialId] = { featured: true, title: it.title, description: it.description };
      setDrafts(d);
    });
  }, [contractorId]);

  if (!isPro) {
    return (
      <p data-testid="portfolio-upsell" style={{ fontFamily: MONO, fontSize: "0.75rem", color: V2_COLORS.muted, lineHeight: 1.5, margin: 0 }}>
        With ContractorPro you can feature your co-signed jobs on your public profile, each with your own write-up.{" "}
        <Link to="/for-pros" style={{ color: V2_COLORS.blue }}>See ContractorPro</Link>
      </p>
    );
  }
  if (creds === null) return <p style={{ fontFamily: MONO, fontSize: "0.75rem", color: V2_COLORS.muted }}>Loading your co-signed jobs…</p>;
  if (creds.length === 0) {
    return (
      <p style={{ fontFamily: MONO, fontSize: "0.75rem", color: V2_COLORS.muted, margin: 0 }}>
        Jobs appear here once a homeowner co-signs them. You can then feature them on your public profile.
      </p>
    );
  }

  const set = (id: number, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? { featured: false, title: "", description: "" }), ...patch } }));
  const featuredCount = Object.values(drafts).filter((d) => d.featured).length;

  const save = async () => {
    const entries = creds
      .filter((c) => drafts[c.id]?.featured)
      .map((c) => ({ credentialId: c.id, title: drafts[c.id].title.trim(), description: drafts[c.id].description.trim() }));
    if (entries.some((e) => !e.title)) { toast.error("Give each featured job a title"); return; }
    setSaving(true);
    try {
      await contractorService.setPortfolio(contractorId, entries);
      toast.success("Portfolio saved.");
    } catch (err: any) {
      toast.error(err.message || "Couldn't save your portfolio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="portfolio-editor" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <p style={{ fontFamily: MONO, fontSize: "0.72rem", color: V2_COLORS.muted, margin: 0 }}>
        Pick up to {MAX_PORTFOLIO_ENTRIES} co-signed jobs to feature on your public profile. Homeowners see your title and write-up, the trade and the month it was co-signed, never the address or the homeowner.
      </p>
      {creds.map((c) => {
        const d = drafts[c.id];
        const atLimit = !d?.featured && featuredCount >= MAX_PORTFOLIO_ENTRIES;
        return (
          <div key={c.id} style={{ border: `1px solid ${V2_COLORS.border}`, padding: "0.75rem 1rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontFamily: MONO, fontSize: "0.75rem", cursor: atLimit ? "not-allowed" : "pointer" }}>
              <input
                type="checkbox"
                checked={!!d?.featured}
                disabled={atLimit}
                onChange={(e) => set(c.id, { featured: e.target.checked, title: d?.title || c.serviceType })}
              />
              <Award size={12} aria-hidden /> {c.serviceType} · co-signed {monthYear(c.verifiedAt)}
            </label>
            {d?.featured && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
                <input
                  className="form-input"
                  aria-label={`Title for ${c.serviceType} job ${c.jobId}`}
                  maxLength={80}
                  value={d.title}
                  onChange={(e) => set(c.id, { title: e.target.value })}
                />
                <textarea
                  className="form-input"
                  aria-label={`Write-up for ${c.serviceType} job ${c.jobId}`}
                  placeholder="What you did, and anything a homeowner should know"
                  maxLength={600}
                  rows={3}
                  value={d.description}
                  onChange={(e) => set(c.id, { description: e.target.value })}
                />
              </div>
            )}
          </div>
        );
      })}
      <div>
        <Button variant="outline" size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save portfolio"}
        </Button>
      </div>
    </div>
  );
}
