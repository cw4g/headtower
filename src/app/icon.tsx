import { ImageResponse } from "next/og";

/**
 * Browser-tab favicon: the same beacon mark as the sidebar logo
 * ({@link import("@/components/beacon-mark").BeaconMark}), rendered with fixed
 * colors instead of theme tokens - a favicon has no CSS context to resolve
 * `fill-ink` / `fill-canvas` against, so the light-theme palette is baked in
 * directly. It reads fine in both light and dark browser chrome.
 */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <svg
        width={32}
        height={32}
        viewBox="0 0 256 256"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="256" height="256" rx="56" fill="#1a1d21" />
        <path d="M128 92 L180 196 L76 196 Z" fill="#fbfaf8" opacity={0.9} />
        <circle cx="128" cy="74" r="18" fill="#f5b544" />
      </svg>
    ),
    { ...size },
  );
}
