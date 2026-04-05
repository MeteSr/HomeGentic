/**
 * Contractor public profile — /contractor/:id
 *
 * Shows a contractor's profile and lets homeowners submit a review.
 * Separate from /contractor/profile (which is the contractor's own edit page).
 */

import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Star, ShieldCheck, Wrench, MessageSquare, Mail, Phone, Award } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { contractorService, ContractorProfile, JobCredential } from "@/services/contractor";
import toast from "react-hot-toast";
import { COLORS, FONTS } from "@/theme";
import { useBreakpoint } from "@/hooks/useBreakpoint";

const S = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
};

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: "0.25rem" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "0.125rem", color: n <= (hover || value) ? COLORS.plumMid : S.rule }}
        >
          <Star size={20} fill={n <= (hover || value) ? COLORS.plumMid : "none"} />
        </button>
      ))}
    </div>
  );
}

export default function ContractorPublicPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();
  const [contractor,   setContractor]   = useState<ContractorProfile | null>(null);
  const [credentials,  setCredentials]  = useState<JobCredential[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [rating,       setRating]       = useState(0);
  const [comment,      setComment]      = useState("");
  const [jobId,        setJobId]        = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [submitted,    setSubmitted]    = useState(false);

  useEffect(() => {
    if (!id) return;
    contractorService.getContractor(id)
      .then((c) => {
        setContractor(c);
        if (c) contractorService.getCredentials(c.id).then(setCredentials).catch(() => {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async () => {
    if (!id) return;
    if (rating === 0) { toast.error("Please select a star rating"); return; }
    if (!comment.trim()) { toast.error("Please write a short comment"); return; }
    if (!jobId.trim()) { toast.error("Please enter the job ID from your records"); return; }

    setSubmitting(true);
    try {
      await contractorService.submitReview(id, rating, comment.trim(), jobId.trim());
      setSubmitted(true);
      toast.success("Review submitted — thank you!");
    } catch (err: any) {
      const msg = err.message ?? "Failed to submit review";
      if (msg.toLowerCase().includes("ratelimit") || msg.toLowerCase().includes("rate limit")) {
        toast.error("You've already reviewed this contractor today. Try again tomorrow.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
          <div className="spinner-lg" />
        </div>
      </Layout>
    );
  }

  if (!contractor) {
    return (
      <Layout>
        <div style={{ maxWidth: "38rem", margin: "2rem auto", padding: "0 1.5rem", textAlign: "center" }}>
          <Wrench size={48} color={S.rule} style={{ margin: "0 auto 1rem" }} />
          <h2 style={{ fontFamily: S.serif, fontWeight: 900 }}>Contractor not found</h2>
          <Button onClick={() => navigate(-1)} style={{ marginTop: "1rem" }}>Go Back</Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: "38rem", margin: "0 auto", padding: isMobile ? "1rem" : "2rem 1.5rem" }}>

        <button
          onClick={() => navigate(-1)}
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "1.5rem" }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        {/* Profile card */}
        <div style={{ border: `1px solid ${S.rule}`, background: COLORS.white, marginBottom: "1.5rem" }}>
          <div style={{ background: S.ink, padding: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
              <div>
                <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.15em", textTransform: "uppercase", color: COLORS.plumMid, marginBottom: "0.375rem" }}>
                  {contractor.specialties.join(" · ") || "—"}
                </p>
                <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: S.paper, marginBottom: "0.375rem" }}>
                  {contractor.name}
                </h1>
                {contractor.serviceArea && (
                  <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: COLORS.plumMid }}>
                    {contractor.serviceArea}
                  </p>
                )}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ width: "3rem", height: "3rem", border: `2px solid ${S.rust}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.1rem", lineHeight: 1, color: S.paper }}>{contractor.trustScore}</span>
                  <span style={{ fontFamily: S.mono, fontSize: "0.45rem", color: COLORS.plumMid }}>/100</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {contractor.isVerified && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.sage }}>
                <ShieldCheck size={13} /> Verified contractor
              </div>
            )}
            <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
              <div>
                <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.15rem" }}>Jobs Completed</p>
                <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.125rem" }}>{contractor.jobsCompleted}</p>
              </div>
              {contractor.licenseNumber && (
                <div>
                  <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.15rem" }}>License</p>
                  <p style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.ink }}>{contractor.licenseNumber}</p>
                </div>
              )}
            </div>
            {contractor.bio && (
              <p style={{ fontSize: "0.85rem", fontWeight: 300, color: S.inkLight, lineHeight: 1.6 }}>{contractor.bio}</p>
            )}
            {/* Contact info */}
            {(contractor.email || contractor.phone) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", paddingTop: "0.75rem", borderTop: `1px solid ${S.rule}` }}>
                {contractor.email && (
                  <a href={`mailto:${contractor.email}`} style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight, textDecoration: "none" }}>
                    <Mail size={11} /> {contractor.email}
                  </a>
                )}
                {contractor.phone && (
                  <a href={`tel:${contractor.phone}`} style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight, textDecoration: "none" }}>
                    <Phone size={11} /> {contractor.phone}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Request a Quote CTA */}
        <div style={{ border: `1px solid ${S.rule}`, background: COLORS.white, padding: "1.25rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.25rem" }}>
              Ready to hire?
            </p>
            <p style={{ fontSize: "0.875rem", fontWeight: 500, color: S.ink }}>
              Request a quote from {contractor.name}
            </p>
          </div>
          <button
            onClick={() => navigate("/quotes/new", { state: { prefill: { serviceType: contractor.specialties[0] ?? "", contractorName: contractor.name } } })}
            style={{ display: isMobile ? "flex" : "inline-flex", width: isMobile ? "100%" : "auto", justifyContent: "center", alignItems: "center", gap: "0.5rem", padding: "0.625rem 1.25rem", background: S.rust, color: COLORS.white, border: "none", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", flexShrink: 0 }}
          >
            <MessageSquare size={13} /> Request Quote
          </button>
        </div>

        {/* Verified Work Portfolio */}
        <div style={{ border: `1px solid ${S.rule}`, background: COLORS.white, marginBottom: "1.5rem" }}>
          <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${S.rule}`, background: COLORS.white, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
              Verified Work Portfolio
            </p>
            {credentials.length > 0 && (
              <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", color: S.sage, border: `1px solid ${S.sage}`, padding: "0.15rem 0.5rem" }}>
                {credentials.length} on-chain
              </span>
            )}
          </div>

          {credentials.length === 0 ? (
            <div style={{ padding: "1.5rem 1.25rem", textAlign: "center" }}>
              <Award size={24} color={S.rule} style={{ margin: "0 auto 0.5rem" }} />
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight }}>
                No verified jobs yet. Credentials appear here as homeowners confirm completed work.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1rem" }}>
              {credentials.slice().sort((a, b) => b.verifiedAt - a.verifiedAt).map((cred) => (
                <div
                  key={cred.id}
                  style={{ background: COLORS.white, padding: "0.875rem 1.25rem", display: "flex", alignItems: "center", gap: "1rem", border: `1px solid ${S.rule}`, borderRadius: 0 }}
                >
                  <div style={{ width: "2rem", height: "2rem", border: `1px solid ${S.sage}`, background: COLORS.sageLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Award size={12} color={S.sage} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "0.875rem", color: S.ink, marginBottom: "0.125rem" }}>
                      {cred.serviceType}
                    </p>
                    <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.06em", color: S.inkLight }}>
                      Verified {new Date(cred.verifiedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      {" · "}Job #{cred.jobId}
                    </p>
                  </div>
                  <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <ShieldCheck size={12} color={S.sage} />
                    <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.06em", color: S.sage }}>ICP Verified</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Review form */}
        <div style={{ border: `1px solid ${S.rule}`, background: COLORS.white }}>
          <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${S.rule}`, background: COLORS.white }}>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
              Leave a Review
            </p>
          </div>

          {submitted ? (
            <div style={{ padding: "2rem", textAlign: "center" }}>
              <p style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.sage, marginBottom: "0.5rem" }}>✓ Review submitted</p>
              <p style={{ fontSize: "0.85rem", color: S.inkLight, fontWeight: 300 }}>
                Thank you — your review helps other homeowners make informed decisions.
              </p>
            </div>
          ) : (
            <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1.125rem" }}>
              <div>
                <label style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, display: "block", marginBottom: "0.5rem" }}>
                  Rating *
                </label>
                <StarRating value={rating} onChange={setRating} />
              </div>
              <div>
                <label className="form-label">Job ID * <span style={{ fontWeight: 300, textTransform: "none", letterSpacing: 0 }}>(from your HomeGentic records)</span></label>
                <input
                  className="form-input"
                  placeholder="e.g. JOB_1"
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Comment *</label>
                <textarea
                  className="form-input"
                  rows={4}
                  placeholder="Describe the quality of work, communication, and punctuality..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  style={{ resize: "vertical" }}
                />
              </div>
              <Button loading={submitting} onClick={handleSubmit} icon={<Star size={14} />}>
                Submit Review
              </Button>
              <p style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.04em", color: S.inkLight, lineHeight: 1.5 }}>
                Reviews are rate-limited to 10 per day per user and require a valid job reference. Duplicate reviews are rejected.
              </p>
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}
