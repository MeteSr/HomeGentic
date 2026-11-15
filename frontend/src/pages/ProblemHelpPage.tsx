/**
 * "Show me the problem": when something at home breaks, the owner describes it
 * (and may add a photo) and gets AI suggestions: likely causes, what's safe to
 * try, what to shut off, and which trade to call, with one tap to a quote
 * request prefilled from the answer. Labelled as AI throughout; it never
 * claims a diagnosis, and danger signs come first.
 */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Siren, Sparkles } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Panel } from "@/components/hud";
import { SHELL_PAGE_MIN_HEIGHT } from "@/components/dashboardV3/chrome";
import { askAboutProblem, problemQuotePrefill, MAX_PROBLEM_PHOTO_MB, type ProblemHelp } from "@/services/problemHelp";

const MONO = "'JetBrains Mono',monospace";
const SERIF = "'Bricolage Grotesque',system-ui,sans-serif";
const BODY = "'Hanken Grotesk',sans-serif";

const h2: React.CSSProperties = {
  fontFamily: SERIF,
  fontWeight: 700,
  fontSize: "1.05rem",
  color: "var(--hg-ink)",
  margin: "0 0 0.5rem",
};
const body: React.CSSProperties = {
  fontFamily: BODY,
  fontSize: "0.9rem",
  color: "var(--hg-ink-2)",
  lineHeight: 1.55,
  margin: 0,
};
const label: React.CSSProperties = {
  display: "block",
  fontFamily: MONO,
  fontSize: "0.65rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--hg-muted)",
  marginBottom: 6,
};
const card: React.CSSProperties = { padding: "1.25rem", marginBottom: "1rem" };
const button = (primary: boolean, disabled = false): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontFamily: BODY,
  fontSize: "0.875rem",
  fontWeight: 600,
  color: primary ? "#FCFCFD" : "var(--hg-ink)",
  background: primary ? "var(--hg-blue)" : "var(--hg-fill)",
  border: primary ? "none" : "1px solid var(--hg-line-2)",
  borderRadius: 100,
  padding: "0.55rem 1.1rem",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.5 : 1,
});

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section style={{ marginTop: "1rem" }}>
      <h3 style={{ ...h2, fontSize: "0.95rem" }}>{title}</h3>
      <ul style={{ ...body, paddingLeft: "1.2rem" }}>
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </section>
  );
}

export default function ProblemHelpPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [help, setHelp] = useState<ProblemHelp | null>(null);

  const ask = async () => {
    setBusy(true);
    setError("");
    setHelp(null);
    try {
      setHelp(await askAboutProblem(description, photo));
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't get suggestions right now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const requestQuote = () => {
    if (help) navigate("/quotes/new", { state: { prefill: problemQuotePrefill(id, description, help) } });
  };
  const quoteLabel = !help
    ? ""
    : help.urgency === "emergency"
      ? "Request an urgent quote"
      : help.serviceType === "Other"
        ? "Request a quote"
        : `Request a quote from a ${help.serviceType} pro`;

  return (
    <Layout>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "1.5rem 1rem", minHeight: SHELL_PAGE_MIN_HEIGHT }}>
        <Link
          to={`/properties/${id}/emergency`}
          style={{ ...body, display: "inline-flex", alignItems: "center", gap: 4, marginBottom: "1rem" }}
        >
          <ArrowLeft size={14} aria-hidden /> Emergency card
        </Link>
        <h1 style={{ fontFamily: SERIF, fontWeight: 800, fontSize: "1.75rem", color: "var(--hg-ink)", margin: 0 }}>
          Show me the problem
        </h1>
        <p style={{ ...body, margin: "0.5rem 0 1rem" }}>
          AI suggestions, not a diagnosis: the AI can't see or test your home. If you smell gas, see smoke or sparks, or
          anyone is hurt, get out and call 911.
        </p>

        <Panel style={card}>
          <label htmlFor="ph-desc" style={label}>
            What's wrong?
          </label>
          <textarea
            id="ph-desc"
            value={description}
            maxLength={1000}
            rows={4}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Water pooling under the water heater since this morning"
            style={{
              ...body,
              width: "100%",
              boxSizing: "border-box",
              padding: "0.6rem 0.75rem",
              border: "1px solid var(--hg-line-2)",
              borderRadius: 10,
              background: "var(--hg-bg)",
            }}
          />
          <label htmlFor="ph-photo" style={{ ...label, marginTop: "0.9rem" }}>
            Add a photo (optional)
          </label>
          <input
            id="ph-photo"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            style={body}
          />
          <p style={{ ...body, fontSize: "0.8rem", color: "var(--hg-muted)", marginTop: 6 }}>
            Up to {MAX_PROBLEM_PHOTO_MB} MB. The photo is sent to the AI to read and isn't saved. Each answer counts
            toward your daily AI limit.
          </p>
          <div style={{ marginTop: "1rem" }}>
            <button
              type="button"
              onClick={ask}
              disabled={busy || !description.trim()}
              style={button(true, busy || !description.trim())}
            >
              <Sparkles size={15} aria-hidden /> {busy ? "Asking…" : "Get AI suggestions"}
            </button>
          </div>
          {error && <p style={{ ...body, color: "var(--hg-bad)", marginTop: "0.75rem" }}>{error}</p>}
        </Panel>

        {help && (
          <Panel style={card}>
            <section aria-labelledby="ph-answer">
              <p style={label}>AI suggestion</p>
              <h2 id="ph-answer" style={h2}>
                {help.summary || "What it could be"}
              </h2>
              {help.danger && (
                <div
                  role="alert"
                  style={{
                    ...body,
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    color: "var(--hg-bad)",
                    fontWeight: 600,
                    border: "1px solid var(--hg-bad)",
                    borderRadius: 10,
                    padding: "0.75rem",
                    marginTop: "0.5rem",
                  }}
                >
                  <Siren size={16} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{help.dangerAdvice}</span>
                </div>
              )}
              <Section title="It could be" items={help.likelyCauses} />
              <Section title="Safe to try now" items={help.safeToTry} />
              <Section title="Shut off" items={help.shutOff} />
              {help.serviceType !== "Other" && (
                <p style={{ ...body, marginTop: "1rem" }}>
                  Who to call: <strong>{help.serviceType}</strong>
                </p>
              )}
              <div style={{ marginTop: "1rem" }}>
                <button type="button" onClick={requestQuote} style={button(true)}>
                  {quoteLabel}
                </button>
              </div>
              <p style={{ ...body, fontSize: "0.8rem", color: "var(--hg-muted)", marginTop: 6 }}>
                The quote form opens with this filled in, and you can change anything before you send it.
              </p>
            </section>
          </Panel>
        )}
      </div>
    </Layout>
  );
}
