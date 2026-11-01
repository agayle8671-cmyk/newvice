"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * RouteProgressBar provides immediate (<16ms) tactile visual feedback across page transitions
 * while preserving the current view so the user NEVER sees a blank screen, white flash, or pausing delay.
 */
export default function RouteProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Complete and fade out progress bar when pathname or query changes
  useEffect(() => {
    if (loading) {
      setProgress(100);
      const timer = setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [pathname, searchParams]);

  // Intercept internal link clicks to start progress bar instantly
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      // Find closest anchor tag
      const target = (e.target as HTMLElement)?.closest?.("a") as HTMLAnchorElement | null;
      if (!target || !target.href) return;

      // Ignore modified clicks (cmd, ctrl, shift, alt) or non-left clicks
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

      // Ignore links that open in new window/tab
      if (target.target && target.target !== "_self") return;

      // Ignore download links
      if (target.hasAttribute("download")) return;

      const url = new URL(target.href, window.location.href);

      // Ignore external domains
      if (url.origin !== window.location.origin) return;

      // Ignore hash-only navigation on the exact same page
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      // Start instant loading feedback (<16ms)
      setLoading(true);
      setProgress(25);

      const step1 = setTimeout(() => setProgress(65), 120);
      const step2 = setTimeout(() => setProgress(85), 350);

      return () => {
        clearTimeout(step1);
        clearTimeout(step2);
      };
    }

    document.addEventListener("click", handleClick, { capture: true });
    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
    };
  }, []);

  if (!loading && progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 inset-x-0 h-[2.5px] z-[99999] pointer-events-none overflow-hidden"
    >
      <div
        className="h-full bg-gradient-to-r from-[#e04040] via-[#ff4d4d] to-[#00f3ff] transition-all duration-200 ease-out shadow-[0_0_8px_rgba(224,64,64,0.9)]"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
          transition: progress === 100 ? "width 120ms ease-out, opacity 200ms ease" : "width 240ms ease-out",
        }}
      />
    </div>
  );
}
