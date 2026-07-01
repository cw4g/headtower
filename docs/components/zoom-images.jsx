"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import mediumZoom from "medium-zoom";

// Click any doc image to view it large over a blurred backdrop. Closes on
// click-outside, scroll, or Esc - medium-zoom handles all of that itself, no
// custom dialog markup needed. Mirrors the old VitePress docs' setup exactly
// (same library, same trigger scope, same backdrop color).
//
// `main img` (not a global selector) so it only ever picks up content images -
// the navbar logo and GitHub icon live outside <main> and are never touched.
export function ZoomImages() {
  const pathname = usePathname();

  useEffect(() => {
    const zoom = mediumZoom("main img", {
      background: "rgba(13, 14, 18, 0.72)",
    });
    return () => zoom.detach();
  }, [pathname]);

  return null;
}
