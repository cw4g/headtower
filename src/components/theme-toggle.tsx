"use client";

import * as React from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import {
  DEFAULT_THEME,
  applyTheme,
  persistTheme,
  type Theme,
} from "@/lib/theme";
import { cn } from "@/lib/cn";

const OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];

/**
 * Sun / monitor / moon theme control in the sidebar footer. The server threads
 * the saved preference in as {@link initialTheme} so the highlighted segment
 * matches the no-flash script's resolution from the first render (no post-mount
 * jump). Selecting an option persists the cookie and flips the `dark` class
 * live; while `system` is active it also tracks OS changes so the console
 * follows along. When {@link collapsed} (or below `md`) the segments stack
 * vertically to fit the icon rail; {@link horizontal} forces the compact
 * side-by-side layout regardless of width (used in the shared footer row).
 */
export function ThemeToggle({
  initialTheme = DEFAULT_THEME,
  collapsed = false,
  horizontal = false,
  cycle = false,
}: {
  initialTheme?: Theme;
  collapsed?: boolean;
  horizontal?: boolean;
  /** One compact square that cycles light → system → dark on click - for rows
   *  where the three-segment control would crowd out its neighbour. */
  cycle?: boolean;
}) {
  const [theme, setTheme] = React.useState<Theme>(initialTheme);

  // While following the OS, re-resolve when the system scheme flips.
  React.useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const select = React.useCallback((next: Theme) => {
    setTheme(next);
    persistTheme(next);
    applyTheme(next);
  }, []);

  if (cycle) {
    const idx = OPTIONS.findIndex((o) => o.value === theme);
    const current = OPTIONS[idx === -1 ? 1 : idx];
    const next = OPTIONS[(idx + 1) % OPTIONS.length];
    const Icon = current.icon;
    return (
      <button
        type="button"
        onClick={() => select(next.value)}
        aria-label={`Theme: ${current.label}. Switch to ${next.label}`}
        title={`Theme: ${current.label} - click for ${next.label}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-line-strong bg-surface-2 text-ink-faint transition-colors hover:border-ink-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
      >
        <Icon className="h-4 w-4" aria-hidden />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 self-center rounded-control border border-line bg-surface-2 p-0.5",
        // In the shared footer row the control sits beside the h-9 search
        // field - match its height exactly so the row reads as one unit.
        collapsed ? "flex-col" : horizontal ? "h-9 flex-row" : "flex-col md:flex-row",
      )}
      role="radiogroup"
      aria-label="Color theme"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => select(value)}
            className={cn(
              "flex items-center justify-center rounded-[0.4rem] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40",
              horizontal ? "h-full w-7" : "h-6 w-6",
              active
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-faint hover:text-ink",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
