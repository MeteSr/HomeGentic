/**
 * The visit on an accepted quote. The contractor offers up to five times and
 * a short note; the homeowner books one, asks for other times or cancels.
 * Either side can cancel. Each step notifies the other side, and both get a
 * reminder the day before a booked visit (agents/notifications).
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { V2_COLORS, V2_FONTS } from "@/theme";
import { errorMessage } from "@/services/candid";
import {
  MAX_VISIT_NOTE_CHARS,
  MAX_VISIT_SLOTS,
  askForNewVisitTimes,
  bookVisitTime,
  cancelVisit,
  formatVisitSlot,
  getVisitBookings,
  offerVisitTimes,
  visitSlotProblem,
  type VisitBooking,
  type VisitSlot,
} from "@/services/visitBooking";

const HOUR = 3_600_000;
const LENGTHS = [1, 2, 3, 4, 8];

const box: React.CSSProperties = {
  border: `1px solid ${V2_COLORS.border}`,
  background: V2_COLORS.paper,
  padding: "1rem 1.25rem",
  marginTop: "0.75rem",
};
const heading: React.CSSProperties = {
  fontFamily: V2_FONTS.body,
  fontSize: "0.65rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  fontWeight: 600,
  color: V2_COLORS.muted,
  margin: "0 0 0.5rem",
};
const text: React.CSSProperties = {
  fontFamily: V2_FONTS.body,
  fontSize: "0.8125rem",
  color: V2_COLORS.ink,
  margin: "0 0 0.5rem",
};
const muted: React.CSSProperties = { ...text, color: V2_COLORS.muted };
const input: React.CSSProperties = {
  fontFamily: V2_FONTS.body,
  fontSize: "0.8125rem",
  padding: "0.4rem 0.5rem",
  border: `1px solid ${V2_COLORS.border}`,
  borderRadius: 6,
};
const row: React.CSSProperties = { display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" };

interface Draft {
  start: string; // datetime-local value, the viewer's time zone
  hours: number;
}

function toSlots(drafts: Draft[]): VisitSlot[] {
  return drafts.map((d) => {
    const startsAt = d.start ? new Date(d.start).getTime() : NaN;
    return { startsAt, endsAt: startsAt + d.hours * HOUR };
  });
}

export function VisitTimesPanel({
  quoteId,
  role,
  otherName,
}: {
  quoteId: string;
  role: "homeowner" | "contractor";
  /** The contractor's name, shown to the homeowner. */
  otherName?: string;
}) {
  const [booking, setBooking] = useState<VisitBooking | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offering, setOffering] = useState(false);

  useEffect(() => {
    let live = true;
    getVisitBookings([quoteId])
      .then((m) => live && setBooking(m.get(quoteId) ?? null))
      .catch(() => {})
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [quoteId]);

  async function run(step: () => Promise<VisitBooking>) {
    setBusy(true);
    setError(null);
    try {
      setBooking(await step());
      setOffering(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;
  const who = otherName || "the contractor";
  const status = booking?.status ?? null;

  return (
    <section aria-label="Visit time" style={box}>
      <p style={heading}>Visit time</p>
      {role === "homeowner" ? (
        <>
          {status === null && <p style={muted}>When {who} offers visit times, you'll pick one here.</p>}
          {status === "timesOffered" && booking && (
            <>
              <p style={text}>{who} offered these times. Pick the one that suits you.</p>
              {booking.note && <p style={muted}>{booking.note}</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginBottom: "0.5rem" }}>
                {booking.offered.map((s, i) => (
                  <div key={i} style={{ ...row, justifyContent: "space-between" }}>
                    <span style={{ ...text, margin: 0 }}>{formatVisitSlot(s)}</span>
                    <Button
                      size="sm"
                      disabled={busy}
                      aria-label={`Book ${formatVisitSlot(s)}`}
                      onClick={() => run(() => bookVisitTime(quoteId, i))}
                    >
                      Book
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => run(() => askForNewVisitTimes(quoteId))}
              >
                None of these work
              </Button>
            </>
          )}
          {status === "booked" && booking?.booked && (
            <>
              <p style={text}>
                <strong>Visit booked:</strong> {formatVisitSlot(booking.booked)}
              </p>
              {booking.note && <p style={muted}>{booking.note}</p>}
              <p style={muted}>{who} has been told. You'll both get a reminder the day before.</p>
              <div style={row}>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => run(() => askForNewVisitTimes(quoteId))}
                >
                  Ask for other times
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => cancelVisit(quoteId))}>
                  Cancel visit
                </Button>
              </div>
            </>
          )}
          {status === "newTimesRequested" && (
            <p style={muted}>You asked {who} for other times. We'll let you know when they offer new ones.</p>
          )}
          {status === "cancelled" && (
            <p style={muted}>Visit cancelled. If {who} offers new times, you'll pick one here.</p>
          )}
        </>
      ) : (
        <>
          {status === "timesOffered" && booking && (
            <>
              <p style={text}>Waiting for the homeowner to pick one of your times:</p>
              <ul style={{ ...muted, paddingLeft: "1.25rem" }}>
                {booking.offered.map((s, i) => (
                  <li key={i}>{formatVisitSlot(s)}</li>
                ))}
              </ul>
            </>
          )}
          {status === "booked" && booking?.booked && (
            <>
              <p style={text}>
                <strong>The homeowner booked:</strong> {formatVisitSlot(booking.booked)}
              </p>
              <p style={muted}>You'll both get a reminder the day before.</p>
            </>
          )}
          {status === "newTimesRequested" && <p style={text}>The homeowner asked for other times. Offer some below.</p>}
          {status === "cancelled" && <p style={muted}>Visit cancelled.</p>}

          {offering || status === null || status === "newTimesRequested" ? (
            <OfferForm
              busy={busy}
              replacesBooking={status === "booked"}
              onError={setError}
              onSend={(slots, note) => run(() => offerVisitTimes(quoteId, slots, note))}
            />
          ) : (
            <div style={row}>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setOffering(true)}>
                Offer new times
              </Button>
              {status !== "cancelled" && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => cancelVisit(quoteId))}>
                  Cancel visit
                </Button>
              )}
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" style={{ ...text, color: V2_COLORS.blue, marginTop: "0.5rem" }}>
          {error}
        </p>
      )}
    </section>
  );
}

function OfferForm({
  busy,
  replacesBooking,
  onError,
  onSend,
}: {
  busy: boolean;
  replacesBooking: boolean;
  onError: (msg: string | null) => void;
  onSend: (slots: VisitSlot[], note: string) => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([{ start: "", hours: 2 }]);
  const [note, setNote] = useState("");
  const set = (i: number, d: Partial<Draft>) => setDrafts((ds) => ds.map((x, j) => (j === i ? { ...x, ...d } : x)));

  function send() {
    const slots = toSlots(drafts);
    const problem = slots.some((s) => Number.isNaN(s.startsAt))
      ? "Each time must be in the future"
      : visitSlotProblem(slots);
    if (problem) {
      onError(problem);
      return;
    }
    onSend(slots, note.trim());
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <p style={muted}>
        Offer up to {MAX_VISIT_SLOTS} times. The homeowner is notified and picks one.
        {replacesBooking && " This replaces the booked time."}
      </p>
      {drafts.map((d, i) => (
        <div key={i} style={row}>
          <label style={{ ...muted, margin: 0 }}>
            <span style={{ display: "block" }}>Time {i + 1} starts</span>
            <input
              type="datetime-local"
              aria-label={`Time ${i + 1} starts`}
              value={d.start}
              onChange={(e) => set(i, { start: e.target.value })}
              style={input}
            />
          </label>
          <label style={{ ...muted, margin: 0 }}>
            <span style={{ display: "block" }}>Length</span>
            <select
              aria-label={`Time ${i + 1} length`}
              value={d.hours}
              onChange={(e) => set(i, { hours: Number(e.target.value) })}
              style={input}
            >
              {LENGTHS.map((h) => (
                <option key={h} value={h}>
                  {h} {h === 1 ? "hour" : "hours"}
                </option>
              ))}
            </select>
          </label>
        </div>
      ))}
      {drafts.length < MAX_VISIT_SLOTS && (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setDrafts((ds) => [...ds, { start: "", hours: 2 }])}>
            Add another time
          </Button>
        </div>
      )}
      <label style={{ ...muted, margin: 0 }}>
        <span style={{ display: "block" }}>Note for the homeowner (optional)</span>
        <textarea
          aria-label="Note for the homeowner"
          value={note}
          maxLength={MAX_VISIT_NOTE_CHARS}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          style={{ ...input, width: "100%", boxSizing: "border-box" }}
        />
      </label>
      <div>
        <Button size="sm" loading={busy} onClick={send}>
          Send times
        </Button>
      </div>
    </div>
  );
}
