"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/cn";
import {
  ACCENT_PRESETS,
  FONT_SIZE_PRESETS,
  applyAccent,
  applyFontSize,
  persistAccent,
  persistFontSize,
} from "./appearance";

export interface AppearanceFormProps {
  initialTheme: Theme;
  initialAccent: string;
  initialFontSize: string;
}

/**
 * Personal display preferences. Reuses the sidebar's own {@link ThemeToggle}
 * unchanged (dark / light / system), plus two more per-browser preferences
 * this page introduces: which hue the console's single beacon accent resolves
 * to, and the base text size. Both apply live by overriding CSS custom
 * properties on the document root and persist to their own cookie, the same
 * mechanism `@/lib/theme` uses for the theme itself - see `./appearance.ts`.
 *
 * Known limitation: unlike the theme cookie, there is no root-layout no-flash
 * script for these two (out of scope for a page confined to `account/`), so a
 * saved accent or text size only re-applies once this page has mounted - a
 * fresh load of another route shows the defaults again until Account is
 * visited in that browser. Selecting "Amber" (the shipped default) or
 * "Default" avoids the gap entirely, since there is then nothing to override.
 */
export function AppearanceForm({
  initialTheme,
  initialAccent,
  initialFontSize,
}: AppearanceFormProps) {
  const [accent, setAccent] = React.useState(initialAccent);
  const [fontSize, setFontSize] = React.useState(initialFontSize);

  // Re-apply on mount so landing here directly (a fresh document) reflects the
  // saved cookie immediately, not just after the next click.
  React.useEffect(() => {
    applyAccent(initialAccent);
    applyFontSize(initialFontSize);
    // Mount-only: selecting a new value below applies itself directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectAccent(id: string) {
    setAccent(id);
    persistAccent(id);
    applyAccent(id);
  }

  function selectFontSize(id: string) {
    setFontSize(id);
    persistFontSize(id);
    applyFontSize(id);
  }

  return (
    <div className="flex flex-col gap-5">
      <Row label="Theme" description="Dark, light, or follow the system.">
        <ThemeToggle initialTheme={initialTheme} />
      </Row>

      <Row label="Accent" description="Which hue the console's single accent resolves to.">
        <div className="flex items-center gap-2" role="radiogroup" aria-label="Accent color">
          {ACCENT_PRESETS.map((preset) => {
            const active = accent === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={preset.label}
                title={preset.label}
                onClick={() => selectAccent(preset.id)}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40",
                  active ? "border-ink" : "border-transparent hover:border-line-strong",
                )}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full"
                  style={{ backgroundColor: preset.swatch }}
                >
                  {active && <Check className="h-3 w-3 text-graphite-950" aria-hidden />}
                </span>
              </button>
            );
          })}
        </div>
      </Row>

      <Row label="Text size" description="Scales every control in the console.">
        <div
          className="flex items-center gap-0.5 rounded-control border border-line bg-surface-2 p-0.5"
          role="radiogroup"
          aria-label="Text size"
        >
          {FONT_SIZE_PRESETS.map((preset) => {
            const active = fontSize === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => selectFontSize(preset.id)}
                className={cn(
                  "rounded-[0.4rem] px-2.5 py-1 text-xs font-medium transition-colors",
                  active ? "bg-surface text-ink shadow-sm" : "text-ink-faint hover:text-ink",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </Row>
    </div>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="text-xs text-ink-faint">{description}</span>
      </div>
      {children}
    </div>
  );
}
