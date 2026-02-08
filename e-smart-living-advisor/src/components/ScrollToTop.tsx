import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Resets window scroll position on route changes (and initial mount).
 * Prevents the app from opening at a previously-restored scroll position.
 */
export const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // Disable browser automatic scroll restoration on refresh/back-forward.
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    // Ensure we start at the top of the page.
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
};
