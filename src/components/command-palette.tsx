"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  Copy,
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
  SquareTerminal,
  Users,
  type LucideIcon,
} from "lucide-react";
import { COMMAND_EVENT } from "@/components/console-sidebar";
import { Kbd } from "@/components/ui/kbd";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
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
  /**
   * Set on Devices (and device-flavoured Recent) rows only: the raw Headscale
   * node id, so the active row can offer the Termix-style one-gesture
   * sub-actions (open terminal, copy IP) without leaving the palette.
   */
  deviceId?: string;
  /** The device's tailnet IPv4, when known - gates the "Copy IP" sub-action. */
  ipv4?: string | null;
}

/**
 * Static quick actions, always at the top of the results. Each jumps to where
 * the action actually lives (Headtower has no globally-mounted dialogs), so
 * "doing" it is one more click after landing - still faster than hunting
 * through nav for it. The `?add=1` / `?create=1` flags tell the destination
 * page to auto-open its dialog on arrival, so the click really is the whole
 * gesture.
 */
const QUICK_ACTIONS: CommandItem[] = [
  {
    id: "quick-add-device",
    label: "Add device",
    href: "/machines?add=1",
    icon: Plus,
    section: "Quick actions",
    keywords: ["enrol", "enroll", "register", "new device", "authkey"],
    capability: "keys.write",
  },
  {
    id: "quick-create-key",
    label: "Create pre-auth key",
    href: "/settings/pre-auth-keys?create=1",
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

/**
 * localStorage key for the "Recents" group: up to {@link RECENTS_LIMIT}
 * command ids, most-recent first. Written only from `select()` below - the
 * palette is the sole place that records a visit, so this never turns into a
 * second, competing tracker of app-wide navigation.
 */
const RECENTS_KEY = "headtower:command-palette:recents";
const RECENTS_LIMIT = 5;

/** Section names eligible for "Recents": actual jump targets, not actions or the audit feed. */
const RECENTABLE_SECTIONS = new Set(["Devices", "Navigate", "Settings"]);

/** Read the persisted recent-command ids; empty (and never throws) with no/blocked storage. */
function readRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Move `id` to the front of the persisted recents, capped at {@link RECENTS_LIMIT}. */
function writeRecent(id: string): string[] {
  const next = [id, ...readRecents().filter((existing) => existing !== id)].slice(
    0,
    RECENTS_LIMIT,
  );
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Storage full/blocked (private browsing, quota) - the session still works,
    // it just won't remember this visit for next time.
  }
  return next;
}

/**
 * The id `select()` should persist for a chosen command, or `null` when it
 * isn't a "visited page" (a Quick action or a Recent activity row). A Recent
 * row itself carries the `recent-` prefix added when it was built below, so
 * re-selecting one still records (and re-bumps) the underlying command.
 */
function recordableId(command: CommandItem): string | null {
  if (RECENTABLE_SECTIONS.has(command.section)) return command.id;
  if (command.section === "Recent") return command.id.replace(/^recent-/, "");
  return null;
}

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
  const [recentIds, setRecentIds] = React.useState<string[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // `ssh.connect` gates the Devices row's inline "Open terminal" sub-action,
  // same rule the machine detail page uses for its own Terminal action.
  const canSsh = !capabilities || capabilities["ssh.connect"] !== false;

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
      deviceId: device.id,
      ipv4: device.ipv4,
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

  // "Recents": the last few pages/devices actually visited from the palette
  // (see `select()`), re-hydrated against the *current* static/device lists so
  // a role change or a removed device just quietly drops the row rather than
  // showing a dead link. Shown only against an empty query - once the operator
  // is typing, the real search results already answer "where do I go".
  const recentCommands = React.useMemo(() => {
    if (query || recentIds.length === 0) return [];
    const byId = new Map(available.map((command) => [command.id, command]));
    const items: CommandItem[] = [];
    for (const id of recentIds) {
      const match = byId.get(id);
      if (!match || !RECENTABLE_SECTIONS.has(match.section)) continue;
      items.push({ ...match, id: `recent-${match.id}`, section: "Recent" });
    }
    return items;
  }, [recentIds, query, available]);

  const openPalette = React.useCallback(() => {
    setQuery("");
    setActive(0);
    setOpen(true);
    setRecentIds(readRecents());
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
    if (!q) {
      if (recentCommands.length === 0) return available;
      // Recents slot in right after Quick actions, ahead of the full lists -
      // a glance at "where was I" before scanning everything else.
      const quickActionIds = new Set(QUICK_ACTIONS.map((command) => command.id));
      const quick = available.filter((command) => quickActionIds.has(command.id));
      const rest = available.filter((command) => !quickActionIds.has(command.id));
      return [...quick, ...recentCommands, ...rest];
    }
    return available.filter((command) =>
      fuzzyMatch(
        q,
        normalize(
          `${command.label} ${(command.keywords ?? []).join(" ")} ${command.section}`,
        ),
      ),
    );
  }, [query, available, recentCommands]);

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
      const recordId = recordableId(command);
      if (recordId) setRecentIds(writeRecent(recordId));
      router.push(command.href);
    },
    [router],
  );

  // Termix-style one-gesture device sub-actions: from the highlighted Devices
  // row, act without leaving the palette first. Both stop propagation so the
  // click never also bubbles into the row's own `select()`.
  const copyDeviceIp = React.useCallback((ip: string) => {
    navigator.clipboard
      .writeText(ip)
      .then(() => toast(`Copied ${ip}`))
      .catch(() => toast.error("Couldn't copy - clipboard unavailable."));
  }, []);

  const openDeviceTerminal = React.useCallback(
    (command: CommandItem) => {
      if (!command.deviceId) return;
      setOpen(false);
      const recordId = recordableId(command);
      if (recordId) setRecentIds(writeRecent(recordId));
      window.open(`/machines/${command.deviceId}/terminal`, "_blank", "noopener");
    },
    [],
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
                    <div
                      id={`command-${command.id}`}
                      data-index={index}
                      role="option"
                      tabIndex={-1}
                      aria-selected={isActive}
                      onMouseMove={() => setActive(index)}
                      onClick={() => select(command)}
                      className={cn(
                        "group relative flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-sm transition-colors",
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

                      {/* Termix-style one-gesture: highlighting a device row
                          surfaces its sub-actions right here, so acting on it
                          never needs a second trip through the palette. */}
                      {command.deviceId && isActive ? (
                        <span className="hidden items-center gap-1 sm:flex">
                          {command.ipv4 && (
                            <Tooltip content="Copy IP">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  copyDeviceIp(command.ipv4!);
                                  inputRef.current?.focus();
                                }}
                                aria-label={`Copy IP for ${command.label}`}
                                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[0.3rem] text-ink-faint transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
                              >
                                <Copy className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            </Tooltip>
                          )}
                          {canSsh && (
                            <Tooltip content="Open terminal">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openDeviceTerminal(command);
                                }}
                                aria-label={`Open terminal for ${command.label}`}
                                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[0.3rem] text-ink-faint transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
                              >
                                <SquareTerminal className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            </Tooltip>
                          )}
                          <Tooltip content="Open detail">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                select(command);
                              }}
                              aria-label={`Open detail for ${command.label}`}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[0.3rem] text-ink-faint transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
                            >
                              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </Tooltip>
                        </span>
                      ) : (
                        <span className="data hidden truncate text-xs text-ink-faint sm:inline">
                          {command.hint ?? command.href}
                        </span>
                      )}
                      {isActive && (
                        <CornerDownLeft
                          className="h-3.5 w-3.5 shrink-0 text-ink-faint"
                          aria-hidden
                        />
                      )}
                    </div>
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
