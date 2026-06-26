/**
 * Headtower brand mark: a beacon above its cone of light. The cone inherits the
 * current text color (so it sits on any surface); the beacon is the amber signal
 * accent, tying the logo to the one accent used across the console.
 */
export function BeaconMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 256"
      className={className}
      role="img"
      aria-label="Headtower"
      fill="none"
    >
      <path d="M128 92 L180 196 L76 196 Z" className="fill-current opacity-40" />
      <circle cx="128" cy="74" r="18" className="fill-beacon-500" />
    </svg>
  );
}
