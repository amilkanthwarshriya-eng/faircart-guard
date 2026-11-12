import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// On navigation: move focus to the content area and update the page title from the new <h1>,
// so keyboard and screen-reader users know the page changed.
export function RouteFocus() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => {
      const h = document.querySelector("main h1");
      document.title = `${h?.textContent ?? "FairCart Guard"} · FairCart Guard`;
    }, 300);
    if (first.current) first.current = false; else document.getElementById("main")?.focus();
    return () => clearTimeout(t);
  }, [pathname]);
  return null;
}
