/**
 * #725: /guide/:token — a house guide shared by link. Public, no sign-in.
 * Shows only the guide and the home's address; unknown, expired and
 * turned-off links all get the same "not working" message.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PageHead } from "@/components/PageHead";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/components/PublicFooter";
import { Main } from "@/components/MainLandmark";
import { Panel } from "@/components/hud";
import { LoadError } from "@/components/LoadError";
import { HouseGuideView, type GuidePhoto } from "@/components/HouseGuideView";
import { houseGuideService, type SharedGuide } from "@/services/houseGuide";

const BODY = "'Hanken Grotesk',sans-serif";

function dateText(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default function SharedHouseGuidePage() {
  const { token = "" } = useParams<{ token: string }>();
  const [state, setState] = useState<"loading" | "ready" | "gone" | "error">("loading");
  const [shared, setShared] = useState<SharedGuide | null>(null);
  const [photos, setPhotos] = useState<GuidePhoto[]>([]);

  const load = useCallback(() => {
    setState("loading");
    houseGuideService
      .getShared(token)
      .then((s) => {
        setShared(s);
        setState(s ? "ready" : "gone");
        if (!s) return;
        const ids = s.guide.photoIds;
        const label = (i: number) => `Photo ${i + 1} of ${ids.length}`;
        setPhotos(ids.map((id, i) => ({ id, url: "", label: label(i) })));
        void Promise.all(ids.map((id) => houseGuideService.sharedPhotoUrl(token, id))).then((urls) =>
          setPhotos(ids.map((id, i) => ({ id, url: urls[i], label: label(i) }))),
        );
      })
      .catch(() => setState("error"));
  }, [token]);
  useEffect(load, [load]);

  return (
    <div
      className="hg-v3"
      data-theme="light"
      style={{
        minHeight: "100vh",
        background: "var(--hg-bg)",
        display: "flex",
        flexDirection: "column",
        color: "var(--hg-ink)",
      }}
    >
      <PageHead>
        <title>House guide | HomeGentic™</title>
        <meta name="robots" content="noindex, nofollow" />
      </PageHead>
      <PublicNav />
      <Main style={{ flex: 1, padding: "2.5rem 1rem", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: "44rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {state === "loading" && (
            <p style={{ fontFamily: BODY, color: "var(--hg-muted)" }}>Loading the house guide…</p>
          )}
          {state === "error" && <LoadError what="the house guide" onRetry={load} />}
          {state === "gone" && (
            <Panel style={{ padding: "1.5rem" }}>
              <h1 style={{ fontFamily: BODY, fontSize: "1.25rem", margin: "0 0 0.5rem" }}>
                This guide link isn't working
              </h1>
              <p style={{ fontFamily: BODY, color: "var(--hg-muted)", margin: 0 }}>
                It may have expired, or the homeowner may have turned it off. Ask the person who sent it for a new one.
              </p>
            </Panel>
          )}
          {state === "ready" && shared && (
            <>
              <div>
                <p
                  style={{
                    fontFamily: BODY,
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--hg-muted)",
                    margin: 0,
                  }}
                >
                  House guide
                </p>
                <h1 style={{ fontFamily: BODY, fontSize: "clamp(1.5rem, 4vw, 2rem)", margin: "0.25rem 0" }}>
                  {shared.address}
                </h1>
                <p style={{ fontFamily: BODY, color: "var(--hg-muted)", margin: 0 }}>
                  {[shared.city, [shared.state, shared.zipCode].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                </p>
              </div>
              <Panel style={{ padding: "1.5rem" }}>
                <HouseGuideView guide={shared.guide} photos={photos} />
              </Panel>
              <p style={{ fontFamily: BODY, fontSize: "0.8125rem", color: "var(--hg-muted)", margin: 0 }}>
                The homeowner wrote this guide and shared it with you. This link works until{" "}
                {dateText(shared.expiresAt)} unless they turn it off sooner. Please don't pass it on.
              </p>
            </>
          )}
        </div>
      </Main>
      <PublicFooter />
    </div>
  );
}
