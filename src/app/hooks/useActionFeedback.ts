import { useRef, useState } from "react";

/** Keep a failed write visible and prevent a second click while it is in flight. */
export function useActionFeedback() {
  const busy = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(key: string, task: () => Promise<void>, message: string) {
    if (busy.current) return false;
    busy.current = true;
    setPending(key);
    setError(null);
    try {
      await task();
      return true;
    } catch {
      setError(message);
      return false;
    } finally {
      busy.current = false;
      setPending(null);
    }
  }
  return { run, pending, error };
}
