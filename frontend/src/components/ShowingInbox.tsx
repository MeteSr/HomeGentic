/**
 * ShowingInbox — Epic 10.4.1
 *
 * Seller-facing inbox of buyer showing requests (the manager page loads them).
 * Accept / Decline / Propose Alternate Time records the seller's answer for
 * their own tracking; HomeGentic doesn't message the buyer, so each row links
 * to the buyer's email or phone for the reply.
 */

import React, { useState } from "react";
import { showingRequestService, contactHref, type ShowingRequest } from "@/services/showingRequest";
import { V2_COLORS, V2_FONTS } from "@/theme";

const UI = {
  ink:      V2_COLORS.ink,
  inkLight: V2_COLORS.muted,
  rule:     V2_COLORS.border,
  serif:    V2_FONTS.display,
  mono:     V2_FONTS.mono,
  sans:     V2_FONTS.body,
};

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  Pending:          { label: "Pending",          color: "#7A7268" },
  Accepted:         { label: "Accepted",          color: "#188038" },
  Declined:         { label: "Declined",          color: "#c0392b" },
  AlternateProposed: { label: "Alternate Proposed", color: "#e37400" },
};

interface RowProps {
  request: ShowingRequest;
  onUpdate: (updated: ShowingRequest) => void;
}

function ShowingRow({ request, onUpdate }: RowProps) {
  const [proposing,     setProposing]     = useState(false);
  const [alternateTime, setAlternateTime] = useState("");
  const [busy,          setBusy]          = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  const badge = STATUS_BADGE[request.status];
  const href  = contactHref(request.contact);

  async function respond(action: () => Promise<ShowingRequest>) {
    setBusy(true);
    setError(null);
    try {
      onUpdate(await action());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function handleAccept() {
    void respond(() => showingRequestService.accept(request.propertyId, request.id));
  }

  function handleDecline() {
    void respond(() => showingRequestService.decline(request.propertyId, request.id));
  }

  async function handleProposeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!alternateTime.trim()) return;
    if (await respond(() => showingRequestService.proposeAlternate(request.propertyId, request.id, alternateTime))) {
      setProposing(false);
      setAlternateTime("");
    }
  }

  return (
    <div data-testid="showing-row" style={{ border: `1px solid ${UI.rule}`, padding: "0.75rem 1rem", marginBottom: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <div style={{ fontFamily: UI.sans, fontWeight: 600, fontSize: "0.9rem", color: UI.ink }}>
            {request.name}
          </div>
          <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight }}>
            {href
              ? <a href={href} style={{ color: "inherit" }} aria-label={`Contact ${request.name}`}>{request.contact}</a>
              : request.contact}
          </div>
          <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, marginTop: "0.15rem" }}>
            {request.preferredTime}
          </div>
          {request.status === "AlternateProposed" && request.alternateTime && (
            <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: "#e37400", marginTop: "0.25rem" }}>
              Alternate: {request.alternateTime}
            </div>
          )}
        </div>
        <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", fontWeight: 700, color: badge.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {badge.label}
        </span>
      </div>

      {request.status === "Pending" && (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
          <button
            onClick={handleAccept}
            disabled={busy}
            aria-label="Accept"
            style={{ padding: "0.3rem 0.75rem", background: "#188038", color: "#fff", border: "none", fontFamily: UI.mono, fontSize: "0.7rem", cursor: "pointer" }}
          >
            Accept
          </button>
          <button
            onClick={handleDecline}
            disabled={busy}
            aria-label="Decline"
            style={{ padding: "0.3rem 0.75rem", background: "#c0392b", color: "#fff", border: "none", fontFamily: UI.mono, fontSize: "0.7rem", cursor: "pointer" }}
          >
            Decline
          </button>
          {!proposing && (
            <button
              onClick={() => setProposing(true)}
              style={{ padding: "0.3rem 0.75rem", background: "transparent", color: UI.ink, border: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.7rem", cursor: "pointer" }}
            >
              Propose Alternate Time
            </button>
          )}
        </div>
      )}

      {proposing && (
        <form onSubmit={handleProposeSubmit} style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <div>
            <label
              htmlFor={`alt-${request.id}`}
              style={{ display: "block", fontFamily: UI.mono, fontSize: "0.6rem", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.2rem" }}
            >
              Alternate Time
            </label>
            <input
              id={`alt-${request.id}`}
              type="text"
              value={alternateTime}
              onChange={(e) => setAlternateTime(e.target.value)}
              placeholder="e.g. Sunday 2pm"
              style={{ padding: "0.35rem 0.5rem", border: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.8rem" }}
            />
          </div>
          <button
            type="submit"
            style={{ alignSelf: "flex-end", padding: "0.35rem 0.75rem", background: UI.ink, color: "#fff", border: "none", fontFamily: UI.mono, fontSize: "0.7rem", cursor: "pointer" }}
          >
            Save Alternate
          </button>
        </form>
      )}

      {error && (
        <p role="alert" style={{ fontFamily: UI.sans, fontSize: "0.75rem", color: "#c0392b", margin: "0.5rem 0 0" }}>{error}</p>
      )}
    </div>
  );
}

export interface ShowingInboxProps {
  requests: ShowingRequest[];
  onUpdate: (updated: ShowingRequest) => void;
}

export default function ShowingInbox({ requests, onUpdate }: ShowingInboxProps) {
  return (
    <div>
      <h2 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "1.15rem", color: UI.ink, margin: "0 0 0.35rem" }}>
        Showing Requests
      </h2>
      <p style={{ fontFamily: UI.sans, fontSize: "0.8rem", color: UI.inkLight, margin: "0 0 0.75rem" }}>
        We notify you of each new request. Buyers aren't told when you accept, decline or propose a time, so reply to them at the email or phone they left.
      </p>
      {requests.length === 0 ? (
        <p style={{ fontFamily: UI.sans, fontSize: "0.875rem", color: UI.inkLight }}>
          No showing requests yet.
        </p>
      ) : (
        requests.map((r) => (
          <ShowingRow key={r.id} request={r} onUpdate={onUpdate} />
        ))
      )}
    </div>
  );
}
