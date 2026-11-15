/**
 * /sell — public entry to Bid to List for sellers who aren't users yet.
 *
 * Explains the auction (verified agents bid with their commission and
 * marketing plan; the seller chooses; HomeGentic charges the winning agent),
 * checks whether enough verified agents serve the visitor's city, and signs
 * them up or sends a signed-in owner to a new listing. Never promises a
 * commission level or a saving.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHead } from "@/components/PageHead";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";
import { agentService } from "@/services/agent";
import { useAuthStore } from "@/store/authStore";
import { MIN_VERIFIED_AGENTS, bidToListOpen } from "@homegentic/shared/sellPrompt";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";

const C = V2_COLORS;
const F = V2_FONTS;

const STEPS = [
  {
    title: "Post your home",
    body: "Tell us when you'd like to list and what you hope to sell for. Your address stays hidden from agents until you pick one.",
  },
  {
    title: "Verified agents bid",
    body: "Licensed agents we've checked send a sealed bid: their commission, their marketing plan and how they'd price your home.",
  },
  {
    title: "You choose",
    body: "Compare the bids side by side and pick one, or none. Agents set their own terms, and you choose.",
  },
];

type Result = { city: string; agents: number } | { city: string; error: true };

export default function SellPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [city, setCity] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const check = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const c = city.trim();
    if (!c) return;
    setChecking(true);
    try {
      const [n] = await agentService.countVerifiedAgents([c]);
      setResult({ city: c, agents: n ?? 0 });
    } catch {
      setResult({ city: c, error: true });
    } finally {
      setChecking(false);
    }
  };

  const start = () =>
    navigate(isAuthenticated ? "/listing/new" : `/login?redirect=${encodeURIComponent("/listing/new")}`);

  return (
    <div style={{ minHeight: "100vh", background: C.paper, display: "flex", flexDirection: "column" }}>
      <PageHead>
        <title>Sell your home with Bid to List | HomeGentic</title>
        <meta
          name="description"
          content="Verified agents bid for your listing with their commission and marketing plan. Agents set their own terms, and you choose."
        />
        <meta property="og:title" content="Sell your home with Bid to List | HomeGentic" />
        <meta property="og:type" content="website" />
      </PageHead>
      <PublicNav />
      <div style={{ flex: 1, padding: "3rem 1.5rem" }}>
        <div style={{ maxWidth: "40rem", margin: "0 auto" }}>
          <div
            style={{
              display: "inline-flex",
              background: C.lblue,
              color: C.blue,
              padding: "5px 16px",
              borderRadius: V2_RADIUS.pill,
              fontSize: "0.75rem",
              fontWeight: 600,
              fontFamily: F.mono,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Bid to List
          </div>
          <h1
            style={{
              fontFamily: F.display,
              fontWeight: 800,
              fontSize: "clamp(2rem, 5vw, 3rem)",
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              color: C.ink,
              margin: "1rem 0 0.75rem",
            }}
          >
            Agents compete. You choose.
          </h1>
          <p style={{ fontFamily: F.body, fontSize: "1.0625rem", lineHeight: 1.6, color: C.muted, margin: 0 }}>
            Thinking of selling? Instead of calling agents one by one, post your home once and let verified agents bid
            for the listing. HomeGentic charges the winning agent, not you.
          </p>

          <ol style={{ listStyle: "none", padding: 0, margin: "2rem 0" }}>
            {STEPS.map((s, i) => (
              <li key={s.title} style={{ display: "flex", gap: "0.875rem", marginBottom: "1.25rem" }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: "none",
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: C.blue,
                    color: C.paper,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: F.mono,
                    fontSize: "0.8rem",
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <h2 style={{ fontFamily: F.body, fontSize: "1rem", fontWeight: 700, color: C.ink, margin: 0 }}>
                    {s.title}
                  </h2>
                  <p
                    style={{
                      fontFamily: F.body,
                      fontSize: "0.9375rem",
                      lineHeight: 1.55,
                      color: C.ink,
                      margin: "0.25rem 0 0",
                    }}
                  >
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <form
            onSubmit={check}
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: V2_RADIUS.card,
              padding: "1.25rem",
              background: C.surface,
            }}
          >
            <label
              htmlFor="sell-city"
              style={{ fontFamily: F.body, fontWeight: 600, fontSize: "0.9375rem", color: C.ink }}
            >
              Your city
            </label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
              <input
                id="sell-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Orlando"
                autoComplete="address-level2"
                style={{
                  flex: "1 1 12rem",
                  fontFamily: F.body,
                  fontSize: "1rem",
                  padding: "0.6rem 0.75rem",
                  border: `1px solid ${C.border}`,
                  borderRadius: V2_RADIUS.input,
                }}
              />
              <button
                type="submit"
                disabled={checking}
                style={{
                  fontFamily: F.body,
                  fontWeight: 600,
                  fontSize: "0.9375rem",
                  padding: "0.6rem 1.25rem",
                  border: "none",
                  borderRadius: V2_RADIUS.pill,
                  background: C.blue,
                  color: C.paper,
                  cursor: "pointer",
                }}
              >
                Check my city
              </button>
            </div>

            {result && "error" in result && (
              <p
                role="alert"
                style={{ fontFamily: F.body, fontSize: "0.9375rem", color: C.coralText, margin: "1rem 0 0" }}
              >
                We couldn't check {result.city} just now. Please try again in a minute.
              </p>
            )}
            {result && "agents" in result && bidToListOpen(result.agents) && (
              <div style={{ marginTop: "1rem" }}>
                <p style={{ fontFamily: F.body, fontSize: "0.9375rem", color: C.ink, margin: 0 }}>
                  <strong>
                    {result.agents} verified agents serve {result.city}.
                  </strong>{" "}
                  Create a free account, add your home, and post it when you're ready.
                </p>
                <button
                  type="button"
                  onClick={start}
                  style={{
                    marginTop: "0.75rem",
                    fontFamily: F.body,
                    fontWeight: 600,
                    fontSize: "0.9375rem",
                    padding: "0.6rem 1.25rem",
                    border: "none",
                    borderRadius: V2_RADIUS.pill,
                    background: C.ink,
                    color: C.paper,
                    cursor: "pointer",
                  }}
                >
                  Get started
                </button>
              </div>
            )}
            {result && "agents" in result && !bidToListOpen(result.agents) && (
              <p style={{ fontFamily: F.body, fontSize: "0.9375rem", color: C.ink, margin: "1rem 0 0" }}>
                Bid to List isn't open in {result.city} yet. It opens in a city once at least {MIN_VERIFIED_AGENTS}{" "}
                verified agents serve it, so every listing gets real competition.
              </p>
            )}
          </form>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
