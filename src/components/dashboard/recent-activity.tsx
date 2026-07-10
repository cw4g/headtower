/**
 * RecentActivity - the last handful of audit-log entries as a tight glance
 * feed: what happened, to what, by whom, and when. A lighter-weight sibling of
 * the full `/audit` table - same source (`listAudit`), fewer columns, no paging.
 * Each row carries a typed leading icon by action kind (see `activityIcon`),
 * kept quiet at `text-ink-faint` - a legend, not a status signal.
 *
 * Intended to sit inside a bare `Card` (edge-to-edge rows with a header above),
 * matching the "Needs attention" section's layout exactly, since both are
 * dashboard-level lists rather than chart widgets.
 */
import type { AuditEntry } from "@/lib/audit";
import { activityIcon, activityLabel } from "@/lib/audit/activity";
import { relativeTime } from "@/lib/machines";
import { StatusDot } from "@/components/ui/status-dot";

export interface RecentActivityProps {
  entries: AuditEntry[];
  /** Request-time clock, so relative labels agree with the rest of the page. */
  now: number;
}

export function RecentActivity({ entries, now }: RecentActivityProps) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-5 text-sm text-ink-muted">
        <StatusDot status="idle" />
        No operator activity recorded yet.
      </div>
    );
  }

  return (
    <ul>
      {entries.map((entry) => {
        const ts = entry.ts instanceof Date ? entry.ts : new Date(entry.ts);
        const target = entry.targetName?.trim() || entry.targetId;
        const Icon = activityIcon(entry.action);
        return (
          <li
            key={entry.id}
            className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0"
          >
            <Icon className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-ink">
                <span className="font-medium">{activityLabel(entry.action)}</span>
                {target && <span className="text-ink-muted"> · {target}</span>}
              </div>
              <div className="data truncate text-xs text-ink-faint">{entry.actor}</div>
            </div>
            <span className="data shrink-0 text-xs text-ink-faint">
              {relativeTime(ts.toISOString(), now)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
