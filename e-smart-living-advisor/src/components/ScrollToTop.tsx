import { useEffect, useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Keeps the window at the top on route changes.
 * Also disables browser scroll restoration and mitigates scroll anchoring-induced jumps.
 */
export const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // Stop the browser from restoring previous scroll on SPA navigations.
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useLayoutEffect(() => {
    const enforceTop = () => {
      // Use multiple mechanisms to beat late restoration and CSS smooth scrolling.
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.scrollTo(0, 0);
    };

    enforceTop();

    const raf1 = window.requestAnimationFrame(enforceTop);
    const raf2 = window.requestAnimationFrame(() => window.requestAnimationFrame(enforceTop));
    const t1 = window.setTimeout(enforceTop, 50);
    const t2 = window.setTimeout(enforceTop, 250);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [pathname]);

  return null;
};

export default ScrollToTop;
