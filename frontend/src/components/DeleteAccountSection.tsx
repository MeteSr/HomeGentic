/**
 * "Delete your account" — Settings → Privacy (desktop) and the mobile account
 * page. Runs accountDeletionService, then signs the user out.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/Button";
import { useAuth } from "@/contexts/AuthContext";
import { accountDeletionService } from "@/services/accountDeletion";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";

const DELETE_CONFIRM_WORD = "DELETE";

export function DeleteAccountSection() {
  const [open,    setOpen]    = useState(false);
  const [typed,   setTyped]   = useState("");
  const [running, setRunning] = useState(false);
  const [step,    setStep]    = useState("");
  const [error,   setError]   = useState("");
  const { logout } = useAuth();
  const navigate   = useNavigate();

  const body = { fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: V2_COLORS.muted, fontWeight: 300, lineHeight: 1.6, marginBottom: "1rem" };

  const handleDelete = async () => {
    setRunning(true);
    setError("");
    try {
      await accountDeletionService.deleteMyAccount((s) => setStep(s));
      toast.success("Your account has been deleted");
      await logout();
      navigate("/");
    } catch (e: any) {
      setError(`${e?.message ?? "Deletion failed"}. Nothing after this step was deleted, so you can try again.`);
    } finally {
      setRunning(false);
      setStep("");
    }
  };

  return (
    <section aria-labelledby="delete-account-heading">
      <h3 id="delete-account-heading" style={{ fontFamily: V2_FONTS.body, fontWeight: 700, fontSize: "1rem", color: V2_COLORS.ink, margin: "0 0 1rem" }}>
        Delete Your Account
      </h3>
      <p style={body}>
        This stops your subscription from renewing and deletes your profile, properties, jobs, photos, documents, bills, reports and
        share links, quotes, smart-home devices and listings from HomeGentic. It can't be undone, so download your data first.
        We keep payment, platform-fee and referral records for tax and accounting, and jobs a contractor logged on someone else's home stay on that home's record.
      </p>
      {!open ? (
        <Button variant="danger" icon={<Trash2 size={13} />} onClick={() => setOpen(true)}>
          Delete My Account
        </Button>
      ) : (
        <div style={{ border: `1px solid ${V2_COLORS.coral}`, borderRadius: V2_RADIUS.sm, padding: "1rem" }}>
          <label htmlFor="delete-account-confirm" style={{ display: "block", fontFamily: V2_FONTS.body, fontWeight: 500, fontSize: "0.875rem", color: V2_COLORS.ink, marginBottom: "0.375rem" }}>
            Type {DELETE_CONFIRM_WORD} to confirm
          </label>
          <input
            id="delete-account-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={running}
            style={{ width: "100%", maxWidth: "16rem", padding: "0.5rem 0.75rem", fontFamily: V2_FONTS.body, fontSize: "0.875rem", border: `1px solid ${V2_COLORS.border}`, borderRadius: V2_RADIUS.sm, marginBottom: "0.75rem" }}
          />
          {running && step && (
            <p role="status" style={{ ...body, marginBottom: "0.75rem" }}>Deleting your {step}…</p>
          )}
          {error && (
            <p role="alert" style={{ ...body, color: V2_COLORS.coralText, marginBottom: "0.75rem" }}>{error}</p>
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button variant="danger" loading={running} disabled={typed !== DELETE_CONFIRM_WORD} onClick={handleDelete}>
              Permanently Delete
            </Button>
            <Button variant="outline" disabled={running} onClick={() => { setOpen(false); setTyped(""); setError(""); }}>
              Keep My Account
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
