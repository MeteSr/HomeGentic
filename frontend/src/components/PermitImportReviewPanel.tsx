/**
 * §17.5.4 — Permit Import Review Panel
 *
 * Shown after registration when permit data is found for the address.
 * Homeowner checks off which permits to add to their job history,
 * then clicks "Add to History" — or "Skip" to dismiss all.
 */

import React, { useState } from "react";
import { COLORS, FONTS } from "@/theme";
import type { ImportedPermit } from "@/services/permitImport";

const S = {
  ink:      COLORS.plum,
  inkLight: COLORS.plumMid,
  rule:     COLORS.rule,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
  sans:     FONTS.sans,
};

interface Props {
  permits:      ImportedPermit[];
  onConfirm:    (confirmed: ImportedPermit[]) => void;
  onDismissAll: () => void;
}

export default function PermitImportReviewPanel({ permits, onConfirm, onDismissAll }: Props) {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const toggle = (idx: number) =>
    setDismissed((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });

  const confirmed = permits.filter((_, i) => !dismissed.has(i));

  return (
    <div style={{ border: `1px solid ${S.rule}`, background: COLORS.white }}>
      {/* Header */}
      <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${S.rule}`, background: COLORS.sageLight }}>
        <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: S.sage, marginBottom: "0.25rem" }}>
          Permit Records Found
        </div>
        <h2 style={{ fontFamily: S.serif, fontWeight: 700, fontSize: "1.1rem", color: S.ink, margin: 0 }}>
          {permits.length} permit{permits.length !== 1 ? "s" : ""} found for this address
        </h2>
        <p style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.inkLight, margin: "0.375rem 0 0" }}>
          Uncheck any permits you'd like to exclude, then click "Add to History."
        </p>
      </div>

      {/* Permit rows */}
      {permits.map((p, i) => {
        const isDismissed = dismissed.has(i);
        const costStr = p.permit.estimatedValueCents
          ? `$${Math.round(p.permit.estimatedValueCents / 100).toLocaleString()}`
          : null;

        return (
          <div
            key={p.permit.permitNumber}
            style={{
              display:       "grid",
              gridTemplateColumns: "auto 1fr",
              gap:           "1rem",
              alignItems:    "start",
              padding:       "0.875rem 1.25rem",
              borderBottom:  `1px solid ${S.rule}`,
              opacity:       isDismissed ? 0.4 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={!isDismissed}
              onChange={() => toggle(i)}
              aria-label={`include permit ${p.permit.permitNumber}`}
              style={{ marginTop: "0.2rem", cursor: "pointer" }}
            />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.25rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.875rem", color: S.ink }}>{p.serviceType}</span>
                <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight }}>
                  #{p.permit.permitNumber}
                </span>
                <span
                  style={{
                    fontFamily:    S.mono,
                    fontSize:      "0.55rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color:         p.permit.status === "Finaled" ? S.sage : S.inkLight,
                    border:        `1px solid ${p.permit.status === "Finaled" ? S.sage : S.rule}`,
                    padding:       "0.15rem 0.4rem",
                  }}
                >
                  {p.permit.status}
                </span>
              </div>
              <div style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.inkLight, marginBottom: "0.2rem" }}>
                {p.permit.description}
              </div>
              <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.04em", color: S.inkLight, display: "flex", gap: "1rem" }}>
                <span>{p.permit.issuedDate}</span>
                {p.permit.contractorName && <span>{p.permit.contractorName}</span>}
                {costStr && <span>{costStr}</span>}
              </div>
            </div>
          </div>
        );
      })}

      {/* Actions */}
      <div style={{ padding: "1rem 1.25rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <button
          onClick={() => onConfirm(confirmed)}
          disabled={confirmed.length === 0}
          style={{
            flex:          1,
            padding:       "0.625rem 1.25rem",
            background:    confirmed.length === 0 ? S.rule : S.ink,
            color:         COLORS.white,
            border:        "none",
            cursor:        confirmed.length === 0 ? "not-allowed" : "pointer",
            fontFamily:    S.mono,
            fontSize:      "0.7rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
          aria-label="add to history"
        >
          Add {confirmed.length} to History
        </button>
        <button
          onClick={onDismissAll}
          style={{ padding: "0.625rem 1rem", background: "none", border: `1px solid ${S.rule}`, cursor: "pointer", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight }}
          aria-label="skip"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
