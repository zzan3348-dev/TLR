import { useEffect, useState } from "react";

export const COMPACT_LAYOUT_QUERY = "(max-width: 720px), (max-width: 932px) and (orientation: landscape) and (max-height: 520px)";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}
