"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Drop-in replacement for every markdown image in the docs (wired in via
// mdx-components.js): a normal inline thumbnail that opens full-size on click,
// over a blurred backdrop, closing on click-away or Escape. Portalled to
// document.body so it always sits above the page regardless of where the
// image is nested.
export function LightboxImage({ src, alt, ...rest }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        {...rest}
        onClick={() => setOpen(true)}
        className="ht-lightbox-thumb"
      />
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="ht-lightbox-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={alt || "Screenshot"}
            onClick={() => setOpen(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="ht-lightbox-full" />
            <button
              type="button"
              className="ht-lightbox-close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              &times;
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
