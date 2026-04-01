/**
 * ShowingInbox — Epic 10.4.1 / 10.4.3
 *
 * Seller-facing inbox of buyer showing requests.
 * Accept / Decline / Propose Alternate Time for each pending request.
 * Request Feedback after a confirmed showing.
 */

import React, { useState, useEffect } from "react";
import { showingRequestService, type ShowingRequest } from "@/services/showingRequest";
import { showingFeedbackService, type FeedbackRequest } from "@/services/showingFeedback";
import { COLORS, FONTS } from "@/theme";

const S = {
  ink:      COLORS.plum,
  inkLight: COLORS.plumMid,
  rule:     COLORS.rule,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
  sans:     FONTS.sans,
};

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  Pending:          { label: "Pending",          color: "#7A7268" },
  Accepted:         { label: "Accepted",          color: "#188038" },
  Declined:         { label: "Declined",          color: "#c0392b" },
  AlternatePending: { label: "Alternate Proposed", color: "#e37400" },
};

interface RowProps {
  request: ShowingRequest;
  onUpdate: (updated: ShowingRequest) => void;
}

function ShowingRow({ request, onUpdate }: RowProps) {
  const [proposing,     setProposing]     = useState(false);
  const [alternateTime, setAlternateTime] = useState("");
  const [feedback,      setFeedback]      = useState<FeedbackRequest | null>(
    () => showingFeedbackService.getByShowing(request.id)
  );
  const [fbSent, setFbSent] = useState(false);

  const badge = STATUS_BADGE[request.status];

  async function handleAccept() {
    onUpdate(showingRequestService.accept(request.id));
  }

  function handleDecline() {
    onUpdate(showingRequestService.decline(request.id));
  }

  function handleProposeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!alternateTime.trim()) return;
    onUpdate(showingRequestService.proposeAlternate(request.id, alternateTime));
    setProposing(false);
    setAlternateTime("");
  }

  async function handleRequestFeedback() {
    const fb = await showingFeedbackService.sendRequest(request.id);
    setFeedback(fb);
    setFbSent(true);
  }

  return (
    <div style={{ border: `1px solid ${S.rule}`, padding: "0.75rem 1rem", marginBottom: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <div style={{ fontFamily: S.sans, fontWeight: 600, fontSize: "0.9rem", color: S.ink }}>
            {request.name}
          </div>
          <div style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight }}>
            {request.contact}
          </div>
          <div style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight, marginTop: "0.15rem" }}>
            {request.preferredTime}
          </div>
          {request.status === "AlternatePending" && request.alternateTime && (
            <div style={{ fontFamily: S.mono, fontSize: "0.65rem", color: "#e37400", marginTop: "0.25rem" }}>
              Alternate: {request.alternateTime}
            </div>
          )}
        </div>
        <span style={{ fontFamily: S.mono, fontSize: "0.65rem", fontWeight: 700, color: badge.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {badge.label}
        </span>
      </div>

      {request.status === "Pending" && (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
          <button
            onClick={handleAccept}
            aria-label="Accept"
            style={{ padding: "0.3rem 0.75rem", background: "#188038", color: "#fff", border: "none", fontFamily: S.mono, fontSize: "0.7rem", cursor: "pointer" }}
          >
            Accept
          </button>
          <button
            onClick={handleDecline}
            aria-label="Decline"
            style={{ padding: "0.3rem 0.75rem", background: "#c0392b", color: "#fff", border: "none", fontFamily: S.mono, fontSize: "0.7rem", cursor: "pointer" }}
          >
            Decline
          </button>
          {!proposing && (
            <button
              onClick={() => setProposing(true)}
              style={{ padding: "0.3rem 0.75rem", background: "transparent", color: S.ink, border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.7rem", cursor: "pointer" }}
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
              style={{ display: "block", fontFamily: S.mono, fontSize: "0.6rem", textTransform: "uppercase", color: S.inkLight, marginBottom: "0.2rem" }}
            >
              Alternate Time
            </label>
            <input
              id={`alt-${request.id}`}
              type="text"
              value={alternateTime}
              onChange={(e) => setAlternateTime(e.target.value)}
              placeholder="e.g. Sunday 2pm"
              style={{ padding: "0.35rem 0.5rem", border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.8rem" }}
            />
          </div>
          <button
            type="submit"
            style={{ alignSelf: "flex-end", padding: "0.35rem 0.75rem", background: S.ink, color: "#fff", border: "none", fontFamily: S.mono, fontSize: "0.7rem", cursor: "pointer" }}
          >
            Send Alternate
          </button>
        </form>
      )}

      {request.status === "Accepted" && (
        <div style={{ marginTop: "0.5rem" }}>
          {feedback?.response ? (
            <div style={{ fontFamily: S.sans, fontSize: "0.8rem", color: S.ink, background: "#f0faf4", border: "1px solid #c3e6cb", padding: "0.5rem 0.75rem" }}>
              {feedback.response}
            </div>
          ) : fbSent || feedback ? (
            <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: "#7A7268" }}>
              Feedback Requested
            </span>
          ) : (
            <button
              onClick={handleRequestFeedback}
              aria-label="Request Feedback"
              style={{ padding: "0.3rem 0.75rem", background: "transparent", color: S.ink, border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.7rem", cursor: "pointer" }}
            >
              Request Feedback
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export interface ShowingInboxProps {
  propertyId: string;
}

export default function ShowingInbox({ propertyId }: ShowingInboxProps) {
  const [requests, setRequests] = useState<ShowingRequest[]>(() =>
    showingRequestService.getByProperty(propertyId)
  );

  useEffect(() => {
    setRequests(showingRequestService.getByProperty(propertyId));
  }, [propertyId]);

  function handleUpdate(updated: ShowingRequest) {
    setRequests((prev) => prev.map((r) => r.id === updated.id ? updated : r));
  }

  return (
    <div>
      <h2 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.15rem", color: S.ink, margin: "0 0 0.75rem" }}>
        Showing Requests
      </h2>
      {requests.length === 0 ? (
        <p style={{ fontFamily: S.sans, fontSize: "0.875rem", color: S.inkLight }}>
          No showing requests yet.
        </p>
      ) : (
        requests.map((r) => (
          <ShowingRow key={r.id} request={r} onUpdate={handleUpdate} />
        ))
      )}
    </div>
  );
}
