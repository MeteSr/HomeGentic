import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { jobService } from "@/services/job";
import { propertyService } from "@/services/property";
import { errorMessage } from "@/services/candid";
import { ToggleRow } from "@/components/ToggleRow";
import { V2_COLORS, V2_FONTS } from "@/theme";

type Home = { id: string; address: string };

/**
 * Settings → Privacy: one switch per home the user owns, for sharing that
 * home's finished job costs in the anonymous ranges on the price lookup
 * (job.setCostSharing). Each switch saves as it changes.
 */
export function CostSharingSettings() {
  const [homes, setHomes] = useState<Home[] | null>(null);
  const [shared, setShared] = useState<Set<string> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let live = true;
    propertyService
      .getMyProperties()
      .then((ps) => {
        if (live) setHomes(ps.map((p) => ({ id: String(p.id), address: p.address })));
      })
      .catch(() => {
        if (live) {
          setHomes([]);
          setLoadFailed(true);
        }
      });
    jobService
      .getMyCostSharing()
      .then((ids) => {
        if (live) setShared(new Set(ids));
      })
      .catch(() => {
        if (live) setLoadFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  async function toggle(id: string, next: boolean) {
    if (!shared) return;
    const flip = (on: boolean) =>
      setShared((cur) => {
        const s = new Set(cur ?? []);
        if (on) s.add(id);
        else s.delete(id);
        return s;
      });
    flip(next);
    try {
      await jobService.setCostSharing(id, next);
    } catch (err) {
      flip(!next);
      toast.error(errorMessage(err, "Couldn't save your sharing setting"));
    }
  }

  return (
    <div>
      <h3
        style={{
          fontFamily: V2_FONTS.body,
          fontWeight: 700,
          fontSize: "1rem",
          color: V2_COLORS.ink,
          margin: "0 0 0.5rem",
        }}
      >
        Share job costs
      </h3>
      <p
        style={{
          fontFamily: V2_FONTS.body,
          fontSize: "0.875rem",
          color: V2_COLORS.muted,
          lineHeight: 1.6,
          marginBottom: "0.5rem",
        }}
      >
        Help neighbors see what work really costs. When a home shares, the prices of its finished jobs from the last 2
        years that were signed off by you and a HomeGentic-verified contractor go into the price ranges on HomeGentic's
        price lookup, which anyone can see. A range only appears once at least 5 homes and 3 contractors nearby share,
        prices are rounded, and it never shows your address, contractor, dates or name. Sharing stops if you sell the
        home.
      </p>
      {homes !== null && homes.length === 0 && !loadFailed && (
        <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.8125rem", color: V2_COLORS.muted }}>
          Homes you own will appear here.
        </p>
      )}
      {(homes ?? []).map((h, i, all) => (
        <ToggleRow
          key={h.id}
          label={`Share costs: ${h.address}`}
          value={shared?.has(h.id) ?? false}
          onChange={(v) => toggle(h.id, v)}
          disabled={shared === null}
          last={i === all.length - 1}
        />
      ))}
      {loadFailed && (
        <p
          role="alert"
          style={{ fontFamily: V2_FONTS.body, fontSize: "0.8125rem", color: V2_COLORS.muted, marginTop: "0.75rem" }}
        >
          Couldn't load your sharing settings. Reload the page to try again.
        </p>
      )}
    </div>
  );
}
