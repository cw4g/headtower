import { ImageResponse } from "next/og";

// Minimal branded share-preview: the same beacon mark as the navbar logo and
// the favicon, dark canvas, wordmark, one-line tagline. Required for static
// export, same as icon.jsx/apple-icon.jsx.
export const dynamic = "force-static";

export const alt = "Headtower - an operator's console for your Headscale tailnet";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          background: "#0e1117",
          padding: "0 90px",
        }}
      >
        <svg width={96} height={96} viewBox="0 0 256 256" style={{ marginBottom: 40 }}>
          <rect width="256" height="256" rx="56" fill="#e6edf3" />
          <path d="M128 92 L180 196 L76 196 Z" fill="#0e1117" opacity={0.85} />
          <circle cx="128" cy="74" r="18" fill="#f5b544" />
        </svg>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 600,
            color: "#e6edf3",
            letterSpacing: "-0.02em",
          }}
        >
          head<span style={{ color: "#7d8590" }}>tower</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 20,
            fontSize: 30,
            color: "#9198a1",
          }}
        >
          An operator&apos;s console for your Headscale tailnet
        </div>
      </div>
    ),
    { ...size },
  );
}
