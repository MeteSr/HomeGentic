/**
 * "Add to calendar" (#717, step 1): downloads an .ics file that any
 * calendar app imports. The file is written in the browser; nothing is sent.
 */
import React from "react";
import { CalendarPlus } from "lucide-react";
import { buildIcs, type IcsEvent } from "@homegentic/shared/ics";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";

export function downloadIcs(filename: string, events: IcsEvent[], name = "HomeGentic"): void {
  const blob = new Blob([buildIcs(events, { name, now: new Date() })], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface Props {
  /** One event, or several that go into the same file. */
  event: IcsEvent | IcsEvent[] | null;
  filename: string;
  /** What is added, for the accessible name: "Add <label> to calendar". */
  label: string;
  style?: React.CSSProperties;
}

export function AddToCalendarButton({ event, filename, label, style }: Props) {
  const events = event === null ? [] : Array.isArray(event) ? event : [event];
  if (events.length === 0) return null;
  return (
    <button
      type="button"
      aria-label={`Add ${label} to calendar`}
      title={`Add ${label} to your calendar`}
      onClick={() => downloadIcs(filename, events)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: V2_FONTS.body,
        fontSize: 12,
        fontWeight: 600,
        color: V2_COLORS.ink,
        background: V2_COLORS.paper,
        border: `1.5px solid ${V2_COLORS.divider}`,
        borderRadius: V2_RADIUS.pill,
        padding: "8px 14px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <CalendarPlus size={13} aria-hidden="true" />
      Add to calendar
    </button>
  );
}
