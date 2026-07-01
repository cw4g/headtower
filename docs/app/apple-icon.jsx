import { ImageResponse } from "next/og";

// iOS home-screen icon: same beacon mark as ./icon.jsx, at Apple's recommended
// 180x180. iOS applies its own corner mask and expects a fully opaque
// background, so the canvas fills the whole square (no rounded corners here).

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
// Required for `output: "export"` - otherwise the static export build treats
// this route as dynamic and refuses to prerender it.
export const dynamic = "force-static";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <svg
        width={180}
        height={180}
        viewBox="0 0 256 256"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="256" height="256" fill="#0e1117" />
        <path d="M128 92 L180 196 L76 196 Z" fill="#e6edf3" opacity={0.4} />
        <circle cx="128" cy="74" r="18" fill="#f5b544" />
      </svg>
    ),
    { ...size },
  );
}
