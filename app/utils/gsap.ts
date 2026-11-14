"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Register once, safe to call multiple times
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced ScrollTrigger.refresh() — call when layout changes after
 * mount (images loading, fonts swapping) so pins and triggers re-measure.
 */
export function refreshScroll(delay = 150): void {
  if (typeof window === "undefined") return;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    ScrollTrigger.refresh();
  }, delay);
}

export { gsap, ScrollTrigger };
