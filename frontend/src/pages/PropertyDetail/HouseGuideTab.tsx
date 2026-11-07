import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/Button";
import { Panel, Pill, SectionHeader, hudButtonStyle, hudInputStyle } from "@/components/hud";
import { LoadError } from "@/components/LoadError";
import { HouseGuideView, type GuidePhoto } from "@/components/HouseGuideView";
import type { Photo } from "@/services/photo";
import { errorMessage } from "@/services/candid";
import { propertyService, type AccessRole } from "@/services/property";
import { canEditDocuments } from "@/services/documentVault";
import { useAuthStore } from "@/store/authStore";
import {
  houseGuideService,
  validateGuide,
  linkState,
  guideLinkUrl,
  isBaselinePhoto,
  baselinePhotoLabel,
  EMPTY_GUIDE,
  LINK_DAY_OPTIONS,
  MAX_GUIDE_CONTACTS,
  MAX_GUIDE_PHOTOS,
  type HouseGuide,
  type GuideLink,
} from "@/services/houseGuide";

const BODY = "'Hanken Grotesk',sans-serif";
const labelText: React.CSSProperties = {
  fontFamily: BODY,
  fontSize: "0.65rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--hg-muted)",
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.25rem" };
const muted: React.CSSProperties = { fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-muted)", margin: 0 };
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "1rem",
};

function dateText(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type TextKey =
  | "wifiName"
  | "wifiPassword"
  | "alarm"
  | "trashDay"
  | "recyclingDay"
  | "waterShutoff"
  | "gasShutoff"
  | "electricPanel"
  | "notes";

/**
 * #725: the house guide for sitters, guests and cleaners, and the expiring
 * links that share it. Owners, co-owners and managers edit and share;
 * viewers only read.
 */
export function HouseGuideTab({ propertyId, photos = [] }: { propertyId: string; photos?: Photo[] }) {
  const principal = useAuthStore((s) => s.principal);
  const [role, setRole] = useState<AccessRole | null>(null);
  const [roleKnown, setRoleKnown] = useState(false);
  const [guide, setGuide] = useState<HouseGuide | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [form, setForm] = useState<HouseGuide | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const canEdit = canEditDocuments(role);

  useEffect(() => {
    if (!principal) return;
    propertyService
      .getAccessRole(propertyId, principal)
      .then(setRole)
      .catch(() => setRole(null))
      .finally(() => setRoleKnown(true));
  }, [propertyId, principal]);

  const load = useCallback(() => {
    setState("loading");
    houseGuideService
      .get(propertyId)
      .then((g) => {
        setGuide(g);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [propertyId]);
  useEffect(load, [load]);

  const baseline = photos.filter(isBaselinePhoto);
  const photoFor = (id: string): GuidePhoto | null => {
    const p = photos.find((x) => x.id === id);
    return p ? { id, url: p.url, label: baselinePhotoLabel(p.description) } : null;
  };

  const save = async (next: HouseGuide | null) => {
    setSaving(true);
    try {
      await houseGuideService.save(propertyId, next);
      setGuide(next);
      setForm(null);
      setConfirmRemove(false);
      toast.success(next ? "Guide saved" : "Guide removed");
    } catch (err) {
      toast.error(errorMessage(err, next ? "Couldn't save the guide" : "Couldn't remove the guide"));
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: React.FormEvent, current: HouseGuide) => {
    e.preventDefault();
    const next: HouseGuide = {
      ...current,
      contacts: current.contacts.map((c) => ({ name: c.name.trim(), role: c.role.trim(), phone: c.phone.trim() })),
    };
    for (const k of [
      "wifiName",
      "alarm",
      "trashDay",
      "recyclingDay",
      "waterShutoff",
      "gasShutoff",
      "electricPanel",
      "notes",
    ] as const)
      next[k] = next[k].trim();
    delete next.updatedAt;
    const why = validateGuide(next);
    setProblem(why);
    if (!why) void save(next);
  };

  if (state === "loading") return <p style={{ fontFamily: BODY, color: "var(--hg-muted)" }}>Loading house guide…</p>;
  if (state === "error") return <LoadError what="the house guide" onRetry={load} />;

  const editing = form ?? (!guide && canEdit ? EMPTY_GUIDE : null);
  const set = (k: TextKey, v: string) => editing && setForm({ ...editing, [k]: v });
  const text = (k: TextKey, label: string, max: number, multiline = false) => (
    <label style={field}>
      <span style={labelText}>{label}</span>
      {multiline ? (
        <textarea
          aria-label={label}
          value={editing![k]}
          maxLength={max}
          rows={3}
          onChange={(e) => set(k, e.target.value)}
          style={{ ...hudInputStyle, resize: "vertical" }}
        />
      ) : (
        <input
          aria-label={label}
          type="text"
          value={editing![k]}
          maxLength={max}
          onChange={(e) => set(k, e.target.value)}
          style={hudInputStyle}
        />
      )}
    </label>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <Panel style={{ padding: "1.5rem" }}>
        <SectionHeader
          title="House guide"
          sub="The practical things a house-sitter, guest or cleaner needs: Wi-Fi, the alarm, trash days, where the shutoffs are and who to call."
        />
        <p style={{ ...muted, marginBottom: "1rem" }}>
          Everything here is stored exactly as you type it, Wi-Fi passwords and alarm codes included. Anyone with a link
          can read everything in it, plus the home's address, until the link expires or you turn it off.
        </p>

        {!guide && !editing && <p style={muted}>No house guide yet.</p>}

        {guide && !form && (
          <>
            <HouseGuideView
              guide={guide}
              photos={guide.photoIds.map(photoFor).filter((p): p is GuidePhoto => p !== null)}
            />
            {canEdit && (
              <div
                style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem", flexWrap: "wrap", alignItems: "center" }}
              >
                {!confirmRemove ? (
                  <>
                    <Button
                      onClick={() => {
                        setForm(guide);
                        setProblem(null);
                      }}
                      style={hudButtonStyle("outline")}
                    >
                      Edit
                    </Button>
                    <Button onClick={() => setConfirmRemove(true)} style={hudButtonStyle("ghost")}>
                      Remove
                    </Button>
                  </>
                ) : (
                  <>
                    <span style={{ fontFamily: BODY, fontSize: "0.875rem", color: "var(--hg-ink)" }}>
                      Remove the guide? Every link to it stops working.
                    </span>
                    <Button onClick={() => void save(null)} disabled={saving} style={hudButtonStyle("danger")}>
                      Yes, remove
                    </Button>
                    <Button onClick={() => setConfirmRemove(false)} style={hudButtonStyle("ghost")}>
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {editing && (
          <form
            onSubmit={(e) => submit(e, editing)}
            noValidate
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div style={grid}>
              {text("wifiName", "Wi-Fi network", 100)}
              {text("wifiPassword", "Wi-Fi password", 100)}
            </div>
            {text("alarm", "Alarm", 500, true)}
            <div style={grid}>
              {text("trashDay", "Trash day", 200)}
              {text("recyclingDay", "Recycling day", 200)}
            </div>
            <div style={grid}>
              {text("waterShutoff", "Water shutoff", 500)}
              {text("gasShutoff", "Gas shutoff", 500)}
              {text("electricPanel", "Electrical panel", 500)}
            </div>

            {baseline.length > 0 && (
              <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
                <legend style={{ ...labelText, marginBottom: 6 }}>
                  Photos from setup to show with the guide (up to {MAX_GUIDE_PHOTOS})
                </legend>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                  {baseline.map((p) => {
                    const label = baselinePhotoLabel(p.description);
                    const on = editing.photoIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontFamily: BODY,
                          fontSize: "0.8125rem",
                          color: "var(--hg-ink)",
                        }}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Show photo: ${label}`}
                          checked={on}
                          disabled={!on && editing.photoIds.length >= MAX_GUIDE_PHOTOS}
                          onChange={() =>
                            setForm({
                              ...editing,
                              photoIds: on ? editing.photoIds.filter((x) => x !== p.id) : [...editing.photoIds, p.id],
                            })
                          }
                        />
                        {p.url && (
                          <img
                            src={p.url}
                            alt=""
                            style={{ width: 40, height: 30, objectFit: "cover", borderRadius: 4 }}
                          />
                        )}
                        {label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <fieldset
              style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}
            >
              <legend style={{ ...labelText, marginBottom: 6 }}>Who to call</legend>
              {editing.contacts.map((c, i) => {
                const update = (patch: Partial<typeof c>) =>
                  setForm({ ...editing, contacts: editing.contacts.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                return (
                  <div key={i} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      aria-label={`Contact ${i + 1} name`}
                      placeholder="Name"
                      value={c.name}
                      maxLength={100}
                      onChange={(e) => update({ name: e.target.value })}
                      style={{ ...hudInputStyle, flex: "1 1 140px" }}
                    />
                    <input
                      aria-label={`Contact ${i + 1} role`}
                      placeholder="Neighbour, plumber…"
                      value={c.role}
                      maxLength={100}
                      onChange={(e) => update({ role: e.target.value })}
                      style={{ ...hudInputStyle, flex: "1 1 140px" }}
                    />
                    <input
                      aria-label={`Contact ${i + 1} phone`}
                      placeholder="Phone"
                      type="tel"
                      value={c.phone}
                      maxLength={40}
                      onChange={(e) => update({ phone: e.target.value })}
                      style={{ ...hudInputStyle, flex: "1 1 120px" }}
                    />
                    <Button
                      type="button"
                      onClick={() => setForm({ ...editing, contacts: editing.contacts.filter((_, j) => j !== i) })}
                      style={hudButtonStyle("ghost")}
                      aria-label={`Remove contact ${i + 1}`}
                    >
                      Remove
                    </Button>
                  </div>
                );
              })}
              {editing.contacts.length < MAX_GUIDE_CONTACTS && (
                <div>
                  <Button
                    type="button"
                    onClick={() =>
                      setForm({ ...editing, contacts: [...editing.contacts, { name: "", role: "", phone: "" }] })
                    }
                    style={hudButtonStyle("outline")}
                  >
                    Add a contact
                  </Button>
                </div>
              )}
            </fieldset>

            {text("notes", "Notes", 4000, true)}

            {problem && (
              <p role="alert" style={{ fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-bad)", margin: 0 }}>
                {problem}
              </p>
            )}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button type="submit" disabled={saving} style={hudButtonStyle("primary")}>
                {saving ? "Saving…" : "Save guide"}
              </Button>
              {form && (
                <Button
                  type="button"
                  onClick={() => {
                    setForm(null);
                    setProblem(null);
                  }}
                  style={hudButtonStyle("ghost")}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
      </Panel>

      {guide && roleKnown && canEdit && <GuideLinks propertyId={propertyId} />}
    </div>
  );
}

/** The share links for one home's guide. Only shown to people who can edit. */
function GuideLinks({ propertyId }: { propertyId: string }) {
  const [links, setLinks] = useState<GuideLink[]>([]);
  const [name, setName] = useState("");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    houseGuideService
      .listLinks(propertyId)
      .then(setLinks)
      .catch(() => setLinks([]));
  }, [propertyId]);

  const create = async () => {
    setBusy(true);
    try {
      const link = await houseGuideService.createLink(propertyId, name.trim(), days);
      setLinks((l) => [link, ...l]);
      setName("");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't create the link"));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (token: string) => {
    try {
      await houseGuideService.revokeLink(token);
      setLinks((l) => l.map((x) => (x.token === token ? { ...x, revoked: true } : x)));
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't turn off the link"));
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.");
    }
  };

  const now = Date.now();
  return (
    <Panel style={{ padding: "1.5rem" }}>
      <SectionHeader
        title="Share with a sitter or guest"
        sub="Each link shows this guide and the home's address, and nothing else from your record. It stops working when it expires or when you turn it off."
      />
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ ...field, flex: "1 1 200px" }}>
          <span style={labelText}>Who is it for?</span>
          <input
            aria-label="Who is it for?"
            placeholder="Cat sitter, weekend guests…"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            style={hudInputStyle}
          />
        </label>
        <label style={field}>
          <span style={labelText}>Link lasts</span>
          <select
            aria-label="Link lasts"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={hudInputStyle}
          >
            {LINK_DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d === 1 ? "1 day" : `${d} days`}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => void create()} disabled={busy} style={hudButtonStyle("primary")}>
          Create link
        </Button>
      </div>

      {links.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            margin: "1.25rem 0 0",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          {links.map((l) => {
            const s = linkState(l, now);
            const url = guideLinkUrl(l.token, window.location.origin);
            return (
              <li
                key={l.token}
                style={{
                  borderTop: "1px solid var(--hg-line)",
                  paddingTop: "0.75rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: BODY, fontWeight: 600, color: "var(--hg-ink)" }}>
                    {l.name || "Guide link"}
                  </span>
                  {s === "live" && <Pill tone="good">Works until {dateText(l.expiresAt)}</Pill>}
                  {s === "expired" && <Pill tone="neutral">Expired</Pill>}
                  {s === "revoked" && <Pill tone="neutral">Turned off</Pill>}
                </div>
                {s === "live" && (
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <input
                      aria-label={`Link for ${l.name || "guide"}`}
                      readOnly
                      value={url}
                      onFocus={(e) => e.target.select()}
                      style={{ ...hudInputStyle, flex: "1 1 260px", minWidth: 0 }}
                    />
                    <Button onClick={() => void copy(url)} style={hudButtonStyle("outline")}>
                      Copy link
                    </Button>
                    <Button onClick={() => void revoke(l.token)} style={hudButtonStyle("ghost")}>
                      Turn off
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
