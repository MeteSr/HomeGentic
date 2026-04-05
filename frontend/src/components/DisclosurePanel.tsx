/**
 * DisclosurePanel — Epic 10.6
 *
 *  10.6.1  Pre-filled disclosure statement from HomeGentic data
 *  10.6.2  Disclosure completeness score
 *  10.6.3  Legal document library
 *  10.6.4  Uploaded legal documents
 *  10.6.5  Inspection waiver readiness badge
 */

import React, { useRef, useState } from "react";
import type { Job } from "@/services/job";
import type { Property } from "@/services/property";
import {
  computeDisclosureScore,
  generateDisclosure,
  inspectionWaiverReady,
} from "@/services/disclosureService";
import { getTemplates, legalDocService, type LegalDoc } from "@/services/legalDocService";
import { COLORS, FONTS } from "@/theme";

const S = {
  ink:      COLORS.plum,
  inkLight: COLORS.plumMid,
  rule:     COLORS.rule,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
  sans:     FONTS.sans,
};

export interface DisclosurePanelProps {
  property: Property;
  jobs:     Job[];
  score?:   number;
}

export default function DisclosurePanel({ property, jobs, score = 0 }: DisclosurePanelProps) {
  const completeness = computeDisclosureScore(property, jobs);
  const disclosure   = generateDisclosure(property, jobs);
  const waiverReady  = inspectionWaiverReady(score, jobs);
  const templates    = getTemplates(property.state);

  const [uploads, setUploads] = useState<LegalDoc[]>(() =>
    legalDocService.getUploads(String(property.id))
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadDocType, setUploadDocType] = useState("SellerDisclosure");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const doc = legalDocService.logUpload(String(property.id), uploadDocType, file.name);
    setUploads((prev) => [...prev, doc]);
    e.target.value = "";
  }

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.25rem", color: S.ink, margin: 0 }}>
          Disclosure
        </h2>
        {waiverReady && (
          <span
            aria-label="Inspection Waiver Ready"
            style={{
              fontFamily: S.mono, fontSize: "0.6rem", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.1em",
              background: COLORS.sageLight, color: S.sage,
              border: `1px solid ${COLORS.sageMid}`, padding: "0.2rem 0.55rem",
            }}
          >
            Inspection Waiver Ready
          </span>
        )}
      </div>

      {/* ── 10.6.2 Completeness score ── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
          <span style={{ fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", color: S.inkLight }}>
            Disclosure Completeness
          </span>
          <span
            aria-label="Completeness score"
            style={{ fontFamily: S.mono, fontWeight: 700, fontSize: "0.9rem", color: S.ink }}
          >
            {completeness}
          </span>
          <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight }}>/100</span>
        </div>
        <div style={{ height: 6, background: COLORS.rule, position: "relative" }}>
          <div
            style={{
              position: "absolute", top: 0, left: 0,
              height: "100%", width: `${completeness}%`,
              background: completeness >= 80 ? S.sage : completeness >= 50 ? "#e8a500" : "#c0392b",
              transition: "width 0.4s",
            }}
          />
        </div>
      </div>

      {/* ── 10.6.1 Material improvements ── */}
      {disclosure.materialImprovements.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.5rem" }}>
            Material Improvements
          </div>
          {disclosure.materialImprovements.map((imp, i) => (
            <div key={i} style={{ display: "flex", gap: "0.75rem", borderTop: `1px solid ${S.rule}`, padding: "0.4rem 0", flexWrap: "wrap" }}>
              <span style={{ fontFamily: S.sans, fontSize: "0.85rem", color: S.ink, flex: 1 }}>
                {imp.serviceType}
              </span>
              <span style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.inkLight }}>{imp.year}</span>
              {imp.verifiedByContractor && (
                <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.sage }}>Contractor Verified</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── 10.6.1 Permits ── */}
      {disclosure.permits.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.5rem" }}>
            Permit History
          </div>
          {disclosure.permits.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: "0.75rem", borderTop: `1px solid ${S.rule}`, padding: "0.4rem 0" }}>
              <span style={{ fontFamily: S.sans, fontSize: "0.85rem", color: S.ink, flex: 1 }}>{p.title}</span>
              <span style={{ fontFamily: S.mono, fontSize: "0.7rem", color: S.inkLight }}>{p.permitNumber}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── 10.6.3 Legal document library ── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.5rem" }}>
          Legal Documents
        </div>
        {templates.map((t) => (
          <div
            key={t.id}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${S.rule}`, padding: "0.5rem 0", gap: "1rem", flexWrap: "wrap" }}
          >
            <div>
              <div style={{ fontFamily: S.sans, fontSize: "0.875rem", fontWeight: 600, color: S.ink }}>{t.title}</div>
              <div style={{ fontFamily: S.sans, fontSize: "0.75rem", color: S.inkLight }}>{t.description}</div>
            </div>
            <a
              href="#"
              aria-label={`Download ${t.title}`}
              style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.ink, textDecoration: "underline" }}
            >
              Download
            </a>
          </div>
        ))}
      </div>

      {/* ── 10.6.4 Uploaded documents ── */}
      <div>
        <div style={{ fontFamily: S.mono, fontSize: "0.65rem", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.5rem" }}>
          Uploaded Documents
        </div>

        {uploads.length === 0 ? (
          <p style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.inkLight, marginBottom: "0.75rem" }}>
            No documents uploaded yet.
          </p>
        ) : (
          <div style={{ marginBottom: "0.75rem" }}>
            {uploads.map((doc) => (
              <div key={doc.id} style={{ display: "flex", gap: "0.75rem", borderTop: `1px solid ${S.rule}`, padding: "0.4rem 0" }}>
                <span style={{ fontFamily: S.sans, fontSize: "0.85rem", color: S.ink, flex: 1 }}>{doc.filename}</span>
                <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight }}>{doc.docType}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={uploadDocType}
            onChange={(e) => setUploadDocType(e.target.value)}
            aria-label="Document type"
            style={{ padding: "0.35rem 0.5rem", border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.7rem" }}
          >
            <option value="SellerDisclosure">Seller Disclosure</option>
            <option value="PurchaseAgreement">Purchase Agreement</option>
            <option value="CounterOfferForm">Counter-Offer Form</option>
            <option value="EarnestMoneyAgreement">Earnest Money</option>
          </select>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={handleFileChange}
            aria-label="Upload document"
            style={{ fontFamily: S.mono, fontSize: "0.7rem" }}
          />
        </div>
      </div>
    </div>
  );
}
