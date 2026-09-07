import { useState, useEffect } from "react";
import { computeScore, recordSnapshot, loadHistory, type ScoreSnapshot } from "@/services/scoreService";
import { type Property } from "@/services/property";
import { type Job } from "@/services/job";

export interface PropertyScore {
  scoreHistory: ScoreSnapshot[];
}

export function usePropertyScore(
  propertyId: string | undefined,
  property: Property | null,
  jobs: Job[],
  loading: boolean
): PropertyScore {
  const [scoreHistory, setScoreHistory] = useState<ScoreSnapshot[]>(() =>
    propertyId ? loadHistory(propertyId) : []
  );

  // Reload history when propertyId changes
  useEffect(() => {
    if (!propertyId) return;
    setScoreHistory(loadHistory(propertyId));
  }, [propertyId]);

  // Record snapshot once property + jobs are resolved.
  // Depends on a derived jobs signature rather than the `jobs` array itself:
  // any caller that passes a freshly-created array each render (e.g. a
  // `.filter()`/`.map()` result, or an inline literal) would otherwise make
  // this effect re-run — and call setScoreHistory — on every single render,
  // an infinite render loop that never yields to the event loop and so is
  // never caught by a test/runtime timeout.
  const jobsKey = jobs.map((j) => j.id).join(",");
  useEffect(() => {
    if (!loading && property) {
      const rawScore = computeScore(jobs, [property]);
      const history = recordSnapshot(rawScore, String(property.id));
      setScoreHistory(history);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, property, jobsKey]);

  return { scoreHistory };
}
