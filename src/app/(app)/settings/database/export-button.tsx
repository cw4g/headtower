import Link from "next/link";
import { Download } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * "Download backup" - a real browser file download, not an app-router
 * navigation.
 *
 * `next/link` is used instead of a plain `<a>` so the href picks up
 * `basePath` automatically when Headtower is mounted under a sub-path (see
 * `next.config.ts`); Next's own click handler already skips client-side
 * routing whenever the anchor carries a `download` attribute, so the browser
 * still does a native save-to-disk rather than trying to render the binary
 * response as a page. The existing session cookie rides along for free since
 * this is a same-origin request.
 *
 * Disabled (inert, no href) when the session lacks `settings.write` - the
 * same bar the Route Handler enforces server-side, so this is UX, not the
 * security boundary.
 */
export function ExportDatabaseButton({ canWrite }: { canWrite: boolean }) {
  const classes = cn(
    "inline-flex h-9 shrink-0 select-none items-center gap-2 whitespace-nowrap rounded-control border px-3.5 text-sm font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    canWrite
      ? "border-beacon-500 bg-beacon-500 text-graphite-950 hover:bg-beacon-400 active:bg-beacon-600"
      : "pointer-events-none border-line bg-surface text-ink-faint opacity-50",
  );

  if (!canWrite) {
    return (
      <span className={classes} aria-disabled title="Requires settings write access">
        <Download className="h-4 w-4" aria-hidden />
        Download backup
      </span>
    );
  }

  return (
    <Link href="/settings/database/export" download className={classes}>
      <Download className="h-4 w-4" aria-hidden />
      Download backup
    </Link>
  );
}
