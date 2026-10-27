import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { withTimeout } from "../services/network";

/** How long a screen waits for its data before showing the error state. */
export const LOAD_TIMEOUT_MS = 30_000;

export interface Loaded<T> {
  data:    T | undefined;
  loading: boolean;
  error:   boolean;
  reload:  () => Promise<void>;
}

/**
 * Runs `load` when the screen gains focus (so returning from LogJob, SignJob,
 * etc. shows fresh data) and whenever `key` changes. Keeps the last good data
 * while reloading. A load that hangs (slow or dropped network) gives up after
 * LOAD_TIMEOUT_MS so the screen can offer a retry instead of spinning.
 */
export function useLoad<T>(load: () => Promise<T>, key: string): Loaded<T> {
  const [data, setData]       = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const v = await withTimeout(loadRef.current(), LOAD_TIMEOUT_MS);
      if (n !== seq.current) return;
      setData(v);
      setError(false);
    } catch {
      if (n === seq.current) setError(true);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload, key]));

  return { data, loading, error, reload };
}
