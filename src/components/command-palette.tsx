"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Activity,
  ChevronRight,
  CornerDownLeft,
  KeyRound,
  KeySquare,
  LayoutDashboard,
  Plus,
  PlugZap,
  Route,
  ScrollText,
  Server,
  Shield,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { COMMAND_EVENT } from "@/components/console-sidebar";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/cn";
import {
  listPaletteActivity,
  listPaletteDevices,
  type PaletteActivityEntry,
  type PaletteDevice,
} from "@/lib/command-palette-data";
import type { DotStatus } from "@/lib/machines";
// Type-only: erased at build, so the rbac server-only guard never runs here.
import type { Capability } from "@/lib/rbac";

/** Plain capability booleans passed from the server; absent means "no". */
export type CapabilityMap = Partial<Record<Capability, boolean>>;

/** Status-dot color per state, for the small corner dot on a Devices row's icon. */
const DOT_CLASS: Record<DotStatus, string> = {
  online: "bg-online-500",
  warn: "bg-warn-500",
  critical: "bg-critical-500",
  idle: "bg-ink-faint",
};

interface CommandItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  section: string;
  /** Extra terms that should match this command even when not in the label. */
  keywords?: string[];
  /** Capability required to surface this target; omitted means always shown. */
  capability?: Capability;
  /** A small colored dot on the icon (Devices rows only). */
  dotStatus?: DotStatus;
  /** Shown in place of the href on the right side, e.g. a device's address. */
  hint?: string;
}

/**
 * Static quick actions, always at the top of the results. Each jumps to where
 * the action actually lives (Headtower has no globally-mounted dialogs), so
 * "doing" it is one more click after landing - still faster than hunting
 * through nav for it.
 */
const QUICK_ACTIONS: CommandItem[] = [
  {
    id: "quick-add-device",
    label: "Add device",
    href: "/machines",
    icon: Plus,
    section: "Quick actions",
    keywords: ["enrol", "enroll", "register", "new device", "authkey"],
    capability: "keys.write",
  },
  {
    id: "quick-create-key",
    label: "Create pre-auth key",
    href: "/settings/pre-auth-keys",
    icon: KeyRound,
    section: "Quick actions",
    keywords: ["preauth", "token", "mint"],
    capability: "keys.write",
  },
];

/**
 * The console's jump targets. Ordered by section so the grouped render stays
 * stable: filtering only removes rows, it never reshuffles them.
 */
const COMMANDS: CommandItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    section: "Navigate",
    keywords: ["home", "overview", "coverage", "tailnet"],
  },
  {
    id: "machines",
    label: "Machines",
    href: "/machines",
    icon: Server,
    section: "Navigate",
    keywords: ["nodes", "devices", "hosts"],
    capability: "machines.read",
  },
  {
    id: "users",
    label: "Users",
    href: "/users",
    icon: Users,
    section: "Navigate",
    keywords: ["people", "accounts", "directory"],
    capability: "users.read",
  },
  {
    id: "access",
    label: "Access",
    href: "/access",
    icon: Shield,
    section: "Navigate",
    keywords: ["acl", "policy", "rules", "ssh"],
    capability: "acls.read",
  },
  {
    id: "routes",
    label: "Routes",
    href: "/routes",
    icon: Route,
    section: "Navigate",
    keywords: ["subnets", "exit nodes", "advertised"],
    capability: "routes.read",
  },
  {
    id: "connection",
    label: "Connection",
    href: "/settings/connection",
    icon: PlugZap,
    section: "Settings",
    keywords: ["headscale", "url", "api key", "server", "endpoint"],
    capability: "settings.read",
  },
  {
    id: "authentication",
    label: "Authentication",
    href: "/settings/authentication",
    icon: ShieldCheck,
    section: "Settings",
    keywords: ["oidc", "sso", "sign in", "login", "identity", "operator"],
    capability: "settings.read",
  },
  {
    id: "pre-auth-keys",
    label: "Pre-auth keys",
    href: "/settings/pre-auth-keys",
    icon: KeyRound,
    section: "Settings",
    keywords: ["preauth", "enrolment", "enrollment", "tokens", "keys"],
    capability: "keys.read",
  },
  {
    id: "api-keys",
    label: "API keys",
    href: "/settings/api-keys",
    icon: KeySquare,
    section: "Settings",
    keywords: ["api", "tokens", "credentials", "keys"],
    capability: "keys.read",
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    href: "/settings/diagnostics",
    icon: Activity,
    section: "Settings",
    keywords: ["health", "status", "version", "debug"],
    capability: "settings.read",
  },
];

/** Strip everything but letters and digits so "pre-auth" == "preauth" == "pre auth". */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** True when every char of `query` appears in `haystack`, in order (subsequence). */
function fuzzyMatch(query: string, haystack: string): boolean {
  if (!query) return true;
  let qi = 0;
  for (let hi = 0; hi < haystack.length && qi < query.length; hi++) {
    if (haystack[hi] === query[qi]) qi++;
  }
  return qi === query.length;
}

/**
 * Cmd-K command bar. App-wide jump nav styled as a console prompt: opens on the
 * window {@link COMMAND_EVENT} the top bar dispatches (and on Cmd/Ctrl-K itself),
 * fuzzy-filters the navigation commands, and routes on Enter or click. Mounted
 * once in the app layout; renders nothing until summoned.
 *
 * `capabilities` are resolved on the server and gate each target by the read
 * capability of the section it jumps to, so a role never sees a destination it
 * can't open. Absent (or absent for a given capability) is treated as allowed.
 */
export function CommandPalette({
  capabilities,
}: {
  capabilities?: CapabilityMap;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [devices, setDevices] = React.useState<PaletteDevice[]>([]);
  const [activity, setActivity] = React.useState<PaletteActivityEntry[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Drop targets the role can't read. With no map (e.g. unauthenticated render)
  // every command is kept, matching the prior always-visible behaviour.
  const staticCommands = React.useMemo(
    () =>
      [...QUICK_ACTIONS, ...COMMANDS].filter(
        (command) =>
          !command.capability ||
          !capabilities ||
          capabilities[command.capability] !== false,
      ),
    [capabilities],
  );

  // Devices + Recent activity are live state, so they're fetched once per open
  // rather than baked into the static list above. A failed fetch (or a role
  // that can't read either) just resolves to an empty group - the static
  // sections must never be held up by it.
  const available = React.useMemo(() => {
    const deviceCommands: CommandItem[] = devices.map((device) => ({
      id: `device-${device.id}`,
      label: device.name,
      href: `/machines/${device.id}`,
      icon: Server,
      section: "Devices",
      keywords: [device.hostname, device.ipv4 ?? "", ...device.tags],
      dotStatus: device.status,
      hint: device.ipv4 ?? device.hostname,
    }));
    const activityCommands: CommandItem[] = activity.map((entry) => ({
      id: `activity-${entry.id}`,
      label: entry.targetLabel
        ? `${entry.actionLabel} ${entry.targetLabel}`
        : entry.actionLabel,
      href: "/audit",
      icon: ScrollText,
      section: "Recent activity",
      keywords: [entry.actor],
      hint: entry.relativeTime,
    }));
    return [...staticCommands, ...deviceCommands, ...activityCommands];
  }, [staticCommands, devices, activity]);

  const openPalette = React.useCallback(() => {
    setQuery("");
    setActive(0);
    setOpen(true);
    // Fresh each open - a glance at current state, not a stale cache. Fails
    // quiet: both actions already resolve to [] on any error or denied read.
    listPaletteDevices()
      .then(setDevices)
      .catch(() => setDevices([]));
    listPaletteActivity()
      .then(setActivity)
      .catch(() => setActivity([]));
  }, []);

  // Open on the top bar's custom event and on Cmd/Ctrl-K. Both paths just open
  // (idempotent), so the duplicate Cmd-K binding can't fight the dispatched event.
  React.useEffect(() => {
    function onCommand() {
      openPalette();
    }
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
      }
    }
    window.addEventListener(COMMAND_EVENT, onCommand);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(COMMAND_EVENT, onCommand);
      window.removeEventListener("keydown", onKey);
    };
  }, [openPalette]);

  // Radix focuses the content; nudge focus onto the input so typing is immediate.
  React.useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = normalize(query);
    if (!q) return available;
    return available.filter((command) =>
      fuzzyMatch(
        q,
        normalize(
          `${command.label} ${(command.keywords ?? []).join(" ")} ${command.section}`,
        ),
      ),
    );
  }, [query, available]);

  // Keep the active row in view as the cursor walks past the scroll edges.
  React.useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${active}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [active, filtered]);

  const select = React.useCallback(
    (command: CommandItem | undefined) => {
      if (!command) return;
      setOpen(false);
      router.push(command.href);
    },
    [router],
  );

  function handleOpenChange(next: boolean) {
    if (next) openPalette();
    else setOpen(false);
  }

  // A fresh query resets the cursor to the first (best-positioned) match.
  function handleQueryChange(event: React.ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setActive(0);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((a) => Math.min(a + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(filtered.length - 1);
        break;
      case "Enter":
        event.preventDefault();
        select(filtered[active]);
        break;
    }
  }

  const activeId = filtered[active]?.id;
  let lastSection: string | null = null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-graphite-950/70 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-label="Command palette"
          className="fixed left-1/2 top-[14vh] z-50 grid-field w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-card border border-line-strong bg-surface shadow-2xl shadow-graphite-950/50 focus:outline-none"
        >
          <DialogPrimitive.Title className="sr-only">
            Command palette
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search and jump to a section of the console.
          </DialogPrimitive.Description>

          {/* Prompt row: beacon prompt glyph + beacon text caret. */}
          <div className="flex items-center gap-2.5 border-b border-line px-4">
            <ChevronRight
              className="h-4 w-4 shrink-0 text-beacon-500"
              aria-hidden
            />
            <input
              ref={inputRef}
              value={query}
              onChange={handleQueryChange}
              onKeyDown={handleInputKeyDown}
              placeholder="Jump to…"
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              role="combobox"
              aria-expanded
              aria-controls="command-palette-list"
              aria-activedescendant={activeId ? `command-${activeId}` : undefined}
              className="data h-12 w-full bg-transparent text-sm text-ink caret-beacon-500 placeholder:text-ink-faint focus:outline-none"
            />
            <Kbd className="hidden sm:inline">esc</Kbd>
          </div>

          {/* Results. Grouped by section; flat-indexed for keyboard nav. */}
          <div
            ref={listRef}
            id="command-palette-list"
            role="listbox"
            aria-label="Commands"
            className="max-h-[min(60vh,22rem)] overflow-y-auto py-1.5"
          >
            {filtered.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-ink-muted">
                  No commands match{" "}
                  <span className="data text-ink">“{query}”</span>.
                </p>
              </div>
            ) : (
              filtered.map((command, index) => {
                const showHeader = command.section !== lastSection;
                lastSection = command.section;
                const Icon = command.icon;
                const isActive = index === active;

                return (
                  <React.Fragment key={command.id}>
                    {showHeader && (
                      <div className="px-4 pb-1 pt-3 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                        {command.section}
                      </div>
                    )}
                    <button
                      type="button"
                      id={`command-${command.id}`}
                      data-index={index}
                      role="option"
                      aria-selected={isActive}
                      onMouseMove={() => setActive(index)}
                      onClick={() => select(command)}
                      className={cn(
                        "group relative flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors",
                        isActive
                          ? "bg-surface-2 text-ink"
                          : "text-ink-muted hover:text-ink",
                      )}
                    >
                      {isActive && (
                        <span
                          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-beacon-500"
                          aria-hidden
                        />
                      )}
                      <span
                        className={cn(
                          "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-control border transition-colors",
                          isActive
                            ? "border-line-strong bg-surface text-beacon-500"
                            : "border-line bg-surface-2 text-ink-faint",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                        {command.dotStatus && (
                          <span
                            className={cn(
                              "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-surface",
                              DOT_CLASS[command.dotStatus],
                            )}
                            aria-hidden
                          />
                        )}
                      </span>
                      <span className="flex-1 truncate">{command.label}</span>
                      <span className="data hidden truncate text-xs text-ink-faint sm:inline">
                        {command.hint ?? command.href}
                      </span>
                      {isActive && (
                        <CornerDownLeft
                          className="h-3.5 w-3.5 shrink-0 text-ink-faint"
                          aria-hidden
                        />
                      )}
                    </button>
                  </React.Fragment>
                );
              })
            )}
          </div>

          {/* Console legend. */}
          <div className="flex items-center gap-3 border-t border-line px-4 py-2.5 text-[11px] text-ink-faint">
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              navigate
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd>
              open
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>esc</Kbd>
              close
            </span>
            <span className="data ml-auto hidden tabular-nums sm:inline">
              {filtered.length} {filtered.length === 1 ? "command" : "commands"}
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
