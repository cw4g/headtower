/**
 * ExpiringSoon - a compact warning list for credentials nearing (or past) their
 * expiry within the dashboard's short lookahead window: node keys and pre-auth
 * keys alike, since both need an operator to renew or mint a replacement. Page.tsx
 * does the classification (which items qualify, sorted nearest-first); this stays
 * a plain content component, matching how `OnlineTrend` and `DeviceBreakdown`
 * take pre-computed data.
 *
 * Intended to sit inside the dashboard's own `Widget` wrapper (padded body), so
 * rows have no horizontal padding of their own - unlike the heavier "Needs
 * attention" section, which owns a bare `Card`.
 */
import Link from "next/link";
import { Chip } from "@/components/ui/chip";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/cn";

export interface ExpiringItem {
  id: string;
  /** "Node key" or "Pre-auth key". */
  kind: string;
  /** Display name of the node, or the key's short id. */
  label: string;
  owner: string;
  /** Pre-rendered relative-time detail, e.g. "expires in 3d" / "expired 2d ago". */
  detail: string;
  expired: boolean;
  /**
   * Deep link to the item's detail page, when there is one. Node keys map to
   * a machine (`/machines/:id`); pre-auth keys have no per-key detail route,
   * so they render inert.
   */
  href?: string;
}

export function ExpiringSoon({ items }: { items: ExpiringItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2.5 py-2 text-sm text-ink-muted">
        <StatusDot status="online" pulse />
        Nothing expiring in the next 7 days.
      </div>
    );
  }

  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const row = (
          <>
            <div className="flex min-w-0 items-center gap-3">
              <StatusDot status={item.expired ? "critical" : "warn"} />
              <div className="min-w-0">
                <div className="data truncate text-sm text-ink">{item.label}</div>
                <div className="truncate text-xs text-ink-faint">
                  {item.kind} · {item.owner} · {item.detail}
                </div>
              </div>
            </div>
            <Chip variant={item.expired ? "critical" : "warn"}>
              {item.expired ? "Expired" : "Expiring"}
            </Chip>
          </>
        );

        if (item.href) {
          return (
            <li key={item.id} className="border-b border-line last:border-0">
              <Link
                href={item.href}
                className={cn(
                  "flex items-center justify-between gap-3 py-2.5 transition-colors",
                  "hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-beacon-500/40",
                )}
              >
                {row}
              </Link>
            </li>
          );
        }

        return (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0"
          >
            {row}
          </li>
        );
      })}
    </ul>
  );
}
