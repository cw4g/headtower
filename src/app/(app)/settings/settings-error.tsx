import { TriangleAlert } from "lucide-react";

export interface SettingsErrorProps {
  /** Headline, e.g. "Couldn't load pre-auth keys". */
  title: string;
  /** Operator-facing detail from {@link describeHeadscaleError}. */
  message: string;
  /** Where the inline Retry link points (the current section). */
  retryHref: string;
}

/** On-brand diagnostic panel for a failed control-plane read in Settings. */
export function SettingsError({ title, message, retryHref }: SettingsErrorProps) {
  return (
    <div className="grid-field flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-critical-500/40 px-6 py-14 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-card border border-critical-500/30 bg-critical-500/10 text-critical-500">
        <TriangleAlert className="h-5 w-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto max-w-sm text-xs text-ink-muted">{message}</p>
      </div>
      <a
        href={retryHref}
        className="text-xs font-medium text-beacon-500 transition-colors hover:text-beacon-400"
      >
        Retry
      </a>
    </div>
  );
}
