"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

/** One row: a label paired with the combo(s) that trigger it. Multiple combos
 *  means "either works" (e.g. the palette answers to both ⌘K and Ctrl-K). */
interface ShortcutEntry {
  combos: string[];
  label: string;
}

interface ShortcutGroup {
  title: string;
  entries: ShortcutEntry[];
}

/**
 * The console's real key bindings, grouped for the help overlay below. Kept in
 * sync by hand against where each one actually lives - CommandPalette (⌘K /
 * Ctrl-K), this file's own "?" listener, and MachinesToolbar ("/") - rather
 * than generated, since the list is short and drift here would read as a lie.
 */
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Global",
    entries: [
      { combos: ["⌘K", "Ctrl-K"], label: "Open command palette" },
      { combos: ["?"], label: "Open this help" },
      { combos: ["esc"], label: "Close" },
    ],
  },
  {
    title: "Machines",
    entries: [{ combos: ["/"], label: "Focus the filter" }],
  },
];

/**
 * Keyboard-shortcuts help overlay. Opens on "?" (Shift+/) from anywhere the
 * operator isn't actively typing, and lists every binding the console really
 * has - Termix-style self-advertising, but never inventing one that doesn't
 * exist. Mounted once in `AppShell` alongside `ToastViewport`; like
 * `CommandPalette`, it renders nothing until summoned, so mounting it is free.
 */
export function ShortcutsHelp() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target;
      // Never steal "?" from an operator who's actually typing a question mark.
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (isTyping) return;
      event.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Every binding the console offers.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-1.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                {group.title}
              </p>
              <div className="flex flex-col gap-1.5">
                {group.entries.map((entry) => (
                  <div
                    key={entry.label}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-ink-muted">{entry.label}</span>
                    <span className="flex items-center gap-1">
                      {entry.combos.map((combo, index) => (
                        <React.Fragment key={combo}>
                          {index > 0 && (
                            <span className="text-ink-faint" aria-hidden>
                              /
                            </span>
                          )}
                          <Kbd>{combo}</Kbd>
                        </React.Fragment>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
