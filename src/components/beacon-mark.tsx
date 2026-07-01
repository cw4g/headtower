/**
 * Headtower brand mark: a beacon over its cone of light, housed in a rounded
 * tile. Theme-adaptive by design - every part is painted from a semantic token
 * so the mark flips cleanly with the console theme:
 *
 *   - the tile is `fill-ink` (a dark tile in light theme, a light tile in dark),
 *   - the cone is `fill-canvas` (the tile's opposite, so it always reads), and
 *   - the beacon dot is the fixed amber accent, tying the logo to the one signal
 *     colour used across the console.
 *
 * Result: light theme = dark tile with a light cone + amber beacon; dark theme =
 * light tile with a dark cone + amber beacon. Size it via `className`.
 */
export function BeaconMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 256"
      className={className}
      role="img"
      aria-label="Headtower"
    >
      <rect width="256" height="256" rx="56" className="fill-ink" />
      <path
        d="M128 92 L180 196 L76 196 Z"
        className="fill-canvas"
        opacity="0.9"
      />
      <circle cx="128" cy="74" r="18" className="fill-beacon-500" />
    </svg>
  );
}
