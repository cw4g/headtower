// Headtower brand mark: a beacon above its cone of light. The cone inherits the
// current text color so it reads on any surface; the dot is the one accent used
// across Headtower - beacon amber (#f5b544), the light in the tower.
export function BeaconMark({ className, style }) {
  return (
    <svg
      viewBox="0 0 256 256"
      className={className}
      style={style}
      role="img"
      aria-label="Headtower"
      fill="none"
    >
      <path d="M128 92 L180 196 L76 196 Z" fill="currentColor" opacity="0.4" />
      <circle cx="128" cy="74" r="18" fill="#f5b544" />
    </svg>
  );
}
