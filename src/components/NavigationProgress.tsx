"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Shows that a click is being worked on. Moving between pages (and changing
 * sort, tab or filter links, which reload the page's data) keeps the old page
 * on screen until the new one arrives, and on a slow connection that looked
 * like the click had done nothing, so people clicked again and cancelled it.
 * Now a bar runs along the top, the clicked link dims, and screen readers
 * hear "Loading".
 */
export function NavigationProgress() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const [pending, setPending] = useState(false);
  const clicked = useRef<HTMLElement | null>(null);

  // The new page has arrived.
  useEffect(() => {
    setPending(false);
    clicked.current?.removeAttribute("data-nav-pending");
    clicked.current = null;
  }, [path, search]);

  useEffect(() => {
    const start = (el: HTMLElement | null) => {
      clicked.current?.removeAttribute("data-nav-pending");
      clicked.current = el;
      el?.setAttribute("data-nav-pending", "");
      setPending(true);
    };
    const onClick = (e: MouseEvent) => {
      // Runs in the capture phase, before Next.js links take over the click (they cancel the default).
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      // Same page and address (or just a #section): nothing to load.
      if (url.pathname === location.pathname && url.search === location.search) return;
      start(a);
    };
    // Search boxes and filter forms that submit by address (method GET).
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (e.defaultPrevented || (form.method || "get").toLowerCase() !== "get" || !form.action.startsWith(location.origin)) return;
      start(form);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  // Never stuck: if something goes wrong, give up the indicator after a while.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(false), 30_000);
    return () => clearTimeout(t);
  }, [pending]);

  return (
    <>
      <div aria-hidden className="nav-progress" data-active={pending ? "" : undefined} />
      <p className="sr-only" role="status" aria-live="polite">
        {pending ? "Loading" : ""}
      </p>
    </>
  );
}
