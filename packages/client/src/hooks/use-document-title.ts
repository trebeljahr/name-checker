"use client";

import { useEffect } from "react";

/**
 * Keep `document.title` at `title` while mounted. The static shell pages
 * only learn their name in the browser, and Next writes the page's static
 * metadata title after hydration (in `next dev` as a `<title>` inside
 * `<body>`), so a single assignment would be undone.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (!title) return;
    const apply = (): void => {
      if (document.title !== title) document.title = title;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [title]);
}
