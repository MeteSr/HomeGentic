import { useState, useEffect } from "react";
import {
  loadHistory,
  recordSnapshot,
  type ScoreSnapshot,
} from "@/services/scoreService";

export interface ScoreTracking {
  scoreHistory: ScoreSnapshot[];
  scoreGoal: number | null;
  setScoreGoal(goal: number | null): void;
}

export function useScoreTracking(
  activePropertyId: string | null,
  homegenticScore: number,
  loading: boolean
): ScoreTracking {
  const [scoreHistory, setScoreHistory] = useState<ScoreSnapshot[]>([]);
  const [scoreGoal, setScoreGoalState] = useState<number | null>(null);

  // Reload history when active property changes
  useEffect(() => {
    if (activePropertyId) {
      setScoreHistory(loadHistory(activePropertyId));
    }
  }, [activePropertyId]);

  // Load persisted score goal when active property changes
  useEffect(() => {
    if (activePropertyId) {
      const stored = localStorage.getItem(`homegentic_score_goal_${activePropertyId}`);
      setScoreGoalState(stored ? parseInt(stored, 10) : null);
    }
  }, [activePropertyId]);

  // Record snapshot once data finishes loading
  useEffect(() => {
    if (!loading && activePropertyId) {
      const history = recordSnapshot(homegenticScore, activePropertyId);
      setScoreHistory(history);
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  function setScoreGoal(goal: number | null) {
    setScoreGoalState(goal);
    const key = activePropertyId
      ? `homegentic_score_goal_${activePropertyId}`
      : "homegentic_score_goal";
    if (goal === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(goal));
  }

  return { scoreHistory, scoreGoal, setScoreGoal };
}
