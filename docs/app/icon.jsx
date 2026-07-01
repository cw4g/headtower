import { ImageResponse } from "next/og";

// Browser-tab favicon for the docs site: the same beacon mark as the navbar
// logo (../components/beacon-mark.jsx), rendered with fixed colors instead of
// `currentColor` - a favicon has no surrounding text color to inherit, so the
// dark-canvas rendering (the docs site's default theme) is baked in directly.

export const size = { width: 32, height: 32 };
export const contentType = "image/png";
// Required for `output: "export"` - otherwise the static export build treats
// this route as dynamic and refuses to prerender it.
export const dynamic = "force-static";

export default function Icon() {
  return new ImageResponse(
    (
      <svg
        width={32}
        height={32}
        viewBox="0 0 256 256"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="256" height="256" rx="56" fill="#0e1117" />
        <path d="M128 92 L180 196 L76 196 Z" fill="#e6edf3" opacity={0.4} />
        <circle cx="128" cy="74" r="18" fill="#f5b544" />
      </svg>
    ),
    { ...size },
  );
}
