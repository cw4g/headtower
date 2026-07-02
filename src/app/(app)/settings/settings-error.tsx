import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

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
    <EmptyState
      tone="critical"
      icon={TriangleAlert}
      title={title}
      description={message}
      action={
        <a
          href={retryHref}
          className="text-xs font-medium text-beacon-500 transition-colors hover:text-beacon-400"
        >
          Retry
        </a>
      }
    />
  );
}
