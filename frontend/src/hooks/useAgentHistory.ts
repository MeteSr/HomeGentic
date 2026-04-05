import { useState, useCallback } from "react";

const STORAGE_KEY = "homegentic_agent_history";
const MAX_ENTRIES  = 50;

export interface AgentAction {
  id:        string;
  timestamp: number;
  toolName:  string;
  label:     string;
  summary:   string;
  success:   boolean;
}

function loadHistory(): AgentAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: AgentAction[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_ENTRIES)));
  } catch {
    // storage unavailable — silently ignore
  }
}

export function useAgentHistory() {
  const [history, setHistory] = useState<AgentAction[]>(loadHistory);

  const addAction = useCallback((action: Omit<AgentAction, "id" | "timestamp">) => {
    const entry: AgentAction = {
      ...action,
      id:        `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, MAX_ENTRIES);
      saveHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { history, addAction, clearHistory };
}
