/**
 * winBackService — 8.3.5
 *
 * Tracks post-cancellation win-back notification windows.
 * Three tiers: 7 days, 30 days, 90 days after cancellation.
 * "Your home didn't stop aging — come back and keep your record current."
 */

export interface WinBackMessage {
  days: 7 | 30 | 90;
  text: string;
}

const MESSAGES: Record<7 | 30 | 90, string> = {
  7:  "Your home didn't stop aging. It's been a week — keep your maintenance record current with HomeGentic Pro.",
  30: "30 days of home aging go untracked. Your roof, HVAC, and plumbing didn't pause — your records did. Come back to HomeGentic.",
  90: "90 days since you left. Buyers ask for maintenance history — make sure yours is ready when it matters most. Rejoin HomeGentic Pro.",
};

const WINDOWS: Array<7 | 30 | 90> = [7, 30, 90];

const STORAGE_KEY    = "homegentic_winback";
const SENT_KEY       = "homegentic_winback_sent";

interface WinBackEntry {
  cancelledAt: number;
}

function load(): WinBackEntry | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WinBackEntry) : null;
  } catch {
    return null;
  }
}

function loadSent(): number[] {
  try {
    const raw = localStorage.getItem(SENT_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

export const winBackService = {
  schedule(cancelledAt: number): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cancelledAt }));
  },

  getPendingMessage(): WinBackMessage | null {
    const entry = load();
    if (!entry) return null;

    const sent     = loadSent();
    const daysSince = (Date.now() - entry.cancelledAt) / 86_400_000;

    for (const days of WINDOWS) {
      if (sent.includes(days)) continue;
      if (daysSince >= days) {
        return { days, text: MESSAGES[days] };
      }
    }
    return null;
  },

  markSent(days: 7 | 30 | 90): void {
    const sent = loadSent();
    if (!sent.includes(days)) {
      localStorage.setItem(SENT_KEY, JSON.stringify([...sent, days]));
    }
  },

  __reset(): void {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SENT_KEY);
  },
};
