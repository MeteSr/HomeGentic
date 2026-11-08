/**
 * The private calendar link on the Maintenance page (#717, step 2).
 *
 * Off: says what the link holds and that anyone with it can read it. On:
 * shows the link with copy, open-in-calendar (webcal://), new link and turn
 * off. Whenever the card mounts with the link on, it republishes the owner's
 * dates if they changed (services/calendarFeed.ts sync).
 */
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CalendarDays } from "lucide-react";
import {
  calendarFeedService,
  collectMyCalendarEvents,
  CALENDAR_FEED_COPY,
  type CalendarFeedStatus,
} from "@/services/calendarFeed";
import { errorMessage } from "@/services/candid";
import { V2_COLORS, V2_FONTS, V2_RADIUS, V2_SHADOWS } from "@/theme";

const C = V2_COLORS;
const F = V2_FONTS;

const btn = (primary: boolean): React.CSSProperties => ({
  fontFamily: F.body,
  fontSize: 12.5,
  fontWeight: 600,
  color: primary ? C.paper : C.ink,
  background: primary ? C.blue : C.paper,
  border: primary ? "none" : `1.5px solid ${C.divider}`,
  borderRadius: V2_RADIUS.pill,
  padding: "9px 17px",
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
});

async function publishLatest(status: CalendarFeedStatus): Promise<void> {
  await calendarFeedService.sync(await collectMyCalendarEvents(), status);
}

export function CalendarFeedCard({ mobile = false }: { mobile?: boolean }) {
  const [status, setStatus] = useState<CalendarFeedStatus | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const available = calendarFeedService.available();

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    calendarFeedService
      .getStatus()
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        if (s)
          publishLatest(s).catch(() => {
            /* the link still serves the last published dates */
          });
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [available]);

  if (!available || status === undefined) return null;

  const turnOn = async () => {
    setBusy(true);
    try {
      const token = await calendarFeedService.enable();
      const s = (await calendarFeedService.getStatus()) ?? { token, version: "", eventCount: 0, updatedAt: 0 };
      await publishLatest(s);
      setStatus(s);
      toast.success("Calendar link ready");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't turn on the calendar link"));
    } finally {
      setBusy(false);
    }
  };

  const newLink = async () => {
    if (!window.confirm("Make a new link? Calendars using the old link will stop updating.")) return;
    setBusy(true);
    try {
      const token = await calendarFeedService.reset();
      setStatus((s) => (s ? { ...s, token } : s));
      toast.success("New calendar link ready");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't make a new link"));
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    if (!window.confirm("Turn off the calendar link? Calendars using it will stop updating.")) return;
    setBusy(true);
    try {
      await calendarFeedService.disable();
      setStatus(null);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't turn off the calendar link"));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it yourself.");
    }
  };

  const url = status ? calendarFeedService.feedUrl(status.token) : "";

  return (
    <div
      data-testid="calendar-feed"
      style={{
        border: `1px solid ${C.border}`,
        background: "#fff",
        borderRadius: V2_RADIUS.card,
        boxShadow: V2_SHADOWS.card,
        padding: mobile ? "16px" : "18px 24px",
        margin: mobile ? "16px 16px 0" : "0 0 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <CalendarDays size={14} color={C.muted} aria-hidden="true" />
        <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.11em", color: C.muted }}>
          CALENDAR LINK{status ? ` · ${status.eventCount} DATE${status.eventCount === 1 ? "" : "S"}` : ""}
        </span>
      </div>
      <p style={{ fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 1.55, margin: "0 0 12px" }}>
        {CALENDAR_FEED_COPY}
      </p>
      {status ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <code
            data-testid="calendar-feed-url"
            style={{
              fontFamily: F.mono,
              fontSize: 12,
              color: C.ink,
              background: C.lblue,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "6px 10px",
              wordBreak: "break-all",
              maxWidth: "100%",
            }}
          >
            {url}
          </code>
          <button type="button" onClick={() => copy(url)} style={btn(true)}>
            Copy link
          </button>
          <a href={calendarFeedService.webcalUrl(status.token)} style={btn(false)}>
            Open in calendar app
          </a>
          <button type="button" onClick={newLink} disabled={busy} style={btn(false)}>
            New link
          </button>
          <button type="button" onClick={turnOff} disabled={busy} style={btn(false)}>
            Turn off
          </button>
        </div>
      ) : (
        <button type="button" onClick={turnOn} disabled={busy} style={btn(true)}>
          Turn on calendar link
        </button>
      )}
    </div>
  );
}
