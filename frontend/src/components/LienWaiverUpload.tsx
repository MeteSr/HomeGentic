/**
 * #716: on the contractor sign-off page, the contractor who signed a job may
 * attach its final lien waiver. The file goes into the home's document vault,
 * filed on this job. HomeGentic keeps the file; it doesn't review it or record
 * it with the county, so the copy says "filed", never that liens are released.
 */
import { useState } from "react";
import { CheckCircle, Loader2, Paperclip } from "lucide-react";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";
import { photoService } from "@/services/photo";
import { jobService } from "@/services/job";
import { errorMessage, hasErrorCode } from "@/services/candid";

/** The photo canister's per-file limit. */
const MAX_BYTES = 1_500_000;

type State =
  { kind: "idle" } | { kind: "uploading" } | { kind: "done"; filename: string } | { kind: "error"; message: string };

export function LienWaiverUpload({ jobId }: { jobId: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setState({
        kind: "error",
        message: "That file is over 1.5 MB. Save a smaller PDF or take a photo of the signed page.",
      });
      return;
    }
    setState({ kind: "uploading" });
    try {
      const id = await photoService.uploadWaiver(file, jobId);
      await jobService.addPaper(jobId, "lienWaiver", id);
      setState({ kind: "done", filename: file.name });
    } catch (e) {
      const message = hasErrorCode(e, "NotAuthorized")
        ? "Only the contractor who signed this job can attach its waiver. Sign in with the same account you signed with."
        : errorMessage(e, "The waiver didn't upload. Please try again.");
      setState({ kind: "error", message });
    }
  }

  return (
    <div
      style={{
        border: `1px solid ${V2_COLORS.border}`,
        borderRadius: V2_RADIUS.sm,
        padding: "1rem 1.25rem",
        marginBottom: "1.25rem",
        textAlign: "left",
      }}
    >
      <p
        style={{
          fontFamily: V2_FONTS.body,
          fontSize: "0.62rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: V2_COLORS.blue,
          margin: "0 0 0.4rem",
        }}
      >
        Final lien waiver (optional)
      </p>
      <p style={{ fontSize: "0.8rem", color: V2_COLORS.ink, lineHeight: 1.6, margin: "0 0 0.75rem" }}>
        Paid in full? Attach your signed final lien waiver for this job, as a PDF or a photo of the signed page. It goes
        into the homeowner's document vault, filed on this job. HomeGentic keeps the file; it doesn't review it or
        record it with the county.
      </p>

      {state.kind === "done" ? (
        <p
          role="status"
          style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", color: V2_COLORS.ink, margin: 0 }}
        >
          <CheckCircle size={16} color={V2_COLORS.blue} aria-hidden /> Waiver filed: {state.filename}
        </p>
      ) : (
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "0.55rem 1rem",
            border: `1px solid ${V2_COLORS.border}`,
            borderRadius: V2_RADIUS.pill,
            fontSize: "0.75rem",
            cursor: state.kind === "uploading" ? "wait" : "pointer",
            color: V2_COLORS.ink,
          }}
        >
          {state.kind === "uploading" ? (
            <Loader2 size={14} data-motion="essential" style={{ animation: "spin 1s linear infinite" }} aria-hidden />
          ) : (
            <Paperclip size={14} aria-hidden />
          )}
          {state.kind === "uploading" ? "Uploading…" : "Attach final lien waiver"}
          <input
            type="file"
            accept="application/pdf,image/*"
            disabled={state.kind === "uploading"}
            onChange={(e) => void onFile(e.target.files?.[0])}
            style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
          />
        </label>
      )}
      {state.kind === "error" && (
        <p role="alert" style={{ fontSize: "0.75rem", color: "#C94C2E", margin: "0.6rem 0 0" }}>
          {state.message}
        </p>
      )}
    </div>
  );
}
