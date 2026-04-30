import { useEffect, useRef } from "react";
import { incrementPagesRead, markActive } from "@/lib/reading-notifications";

/**
 * Counts a page as "read" when the user dwells on it for >= 5s with the tab visible.
 * Only counts each page (per book) once per session.
 */
export function usePageDwell(bookId: string, page: number) {
  const counted = useRef<Set<string>>(new Set());

  useEffect(() => {
    markActive();
  }, []);

  useEffect(() => {
    const key = `${bookId}:${page}`;
    if (counted.current.has(key)) return;

    let elapsed = 0;
    let last = Date.now();
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      const now = Date.now();
      if (document.visibilityState === "visible") {
        elapsed += now - last;
        if (elapsed >= 5000 && !counted.current.has(key)) {
          counted.current.add(key);
          incrementPagesRead(1);
          if (timer) clearInterval(timer);
        }
      }
      last = now;
    };

    timer = setInterval(tick, 1000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [bookId, page]);
}
