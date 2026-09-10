import { useEffect, useState } from "react";

export function useSessionPreference<T extends string>(key: string, fallback: T, allowed?: readonly string[]) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(`tlr-admin-v1:${key}`);
      return saved !== null && (!allowed || allowed.includes(saved)) ? saved as T : fallback;
    } catch { return fallback; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(`tlr-admin-v1:${key}`, value); } catch { /* Private mode may disable storage. */ }
  }, [key, value]);
  return [value, setValue] as const;
}
