"use client";

import * as React from "react";
import { Zap, RotateCw, Eraser, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SshTerminal,
  STATE_DOT,
  STATE_LABEL,
  type ConnectionState,
} from "@/components/terminal/ssh-terminal";
import {
  TERMINAL_THEMES,
  DEFAULT_THEME_ID,
  loadThemeId,
  saveThemeId,
  resolveTheme,
} from "@/components/terminal/terminal-themes";
import { cn } from "@/lib/cn";

export const DEFAULT_SSH_USER = "root";

export interface TerminalConsoleProps {
  /** Node hostname (MagicDNS) or tailnet IP the agent will dial on port 22. */
  host: string;
  /** SSH user to open the first session with — from `?user=`, or {@link DEFAULT_SSH_USER}. */
  defaultUser: string;
}

/**
 * A self-contained terminal "window", Termius-style: a slim toolbar (live
 * status, an inline SSH-user field, Connect/Reconnect, a color-scheme picker,
 * and Clear) over a bounded-height {@link SshTerminal}. The fixed height is the
 * point - the terminal fills a definite box and scrolls internally, instead of
 * an unbounded pane that grows with output.
 */
export function TerminalConsole({ host, defaultUser }: TerminalConsoleProps) {
  const [user, setUser] = React.useState(defaultUser);
  const [session, setSession] = React.useState<{ user: string; key: number }>({
    user: defaultUser,
    key: 0,
  });
  const [themeId, setThemeId] = React.useState(DEFAULT_THEME_ID);
  const [status, setStatus] = React.useState<ConnectionState>("connecting");
  const [clearSignal, setClearSignal] = React.useState(0);

  // Read the persisted theme after mount (avoids an SSR/client mismatch): the
  // server has no localStorage, so we start on the default and hydrate here.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydrate from localStorage after mount
    setThemeId(loadThemeId());
  }, []);

  const connect = React.useCallback(() => {
    const trimmed = user.trim() || DEFAULT_SSH_USER;
    setUser(trimmed);
    setSession((prev) => ({ user: trimmed, key: prev.key + 1 }));
  }, [user]);

  function pickTheme(id: string) {
    setThemeId(id);
    saveThemeId(id);
  }

  const connected = status === "connected";
  const activeTheme =
    TERMINAL_THEMES.find((t) => t.id === themeId) ?? TERMINAL_THEMES[0];

  return (
    <div className="flex h-[calc(100dvh-11rem)] min-h-[22rem] flex-col overflow-hidden rounded-card border border-line-strong bg-surface-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATE_DOT[status])}
            aria-hidden
          />
          <span className="data truncate text-xs text-ink-muted">
            <span className="text-ink">{session.user}</span>@
            <span className="text-ink">{host}</span>
          </span>
          <span className="hidden shrink-0 text-xs text-ink-faint sm:inline">
            · {STATE_LABEL[status]}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex h-8 items-center gap-1.5 rounded-control border border-line-strong bg-surface px-2.5 focus-within:border-ink-faint">
            <label
              htmlFor="ssh-user-input"
              className="text-[10px] font-medium uppercase tracking-wide text-ink-faint"
            >
              user
            </label>
            <input
              id="ssh-user-input"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  connect();
                }
              }}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="data h-8 w-24 bg-transparent text-xs text-ink outline-none placeholder:text-ink-faint"
              placeholder={DEFAULT_SSH_USER}
            />
          </div>

          <Button variant="outline" size="sm" onClick={connect} className="gap-1.5">
            {connected ? (
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Zap className="h-3.5 w-3.5" aria-hidden />
            )}
            {connected ? "Reconnect" : "Connect"}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-8 justify-center px-0"
                aria-label="Terminal theme"
                title="Terminal theme"
              >
                <Swatch themeId={activeTheme.id} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>Terminal theme</DropdownMenuLabel>
              {TERMINAL_THEMES.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onSelect={() => pickTheme(t.id)}
                  className="gap-2"
                >
                  <Swatch themeId={t.id} />
                  <span className="flex-1">{t.label}</span>
                  {t.id === themeId && (
                    <Check className="h-3.5 w-3.5 text-beacon-500" aria-hidden />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setClearSignal((s) => s + 1)}
            aria-label="Clear terminal"
            title="Clear terminal"
            className="w-8 justify-center px-0"
          >
            <Eraser className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      <SshTerminal
        key={session.key}
        host={host}
        user={session.user}
        themeId={themeId}
        onStatusChange={setStatus}
        clearSignal={clearSignal}
      />
    </div>
  );
}

/** A small round chip showing a theme's background + cursor accent. */
function Swatch({ themeId }: { themeId: string }) {
  const theme = resolveTheme(themeId);
  return (
    <span
      className="h-3.5 w-3.5 shrink-0 rounded-full border border-line-strong"
      style={{
        background: theme.background,
        boxShadow: `inset 0 0 0 2px ${theme.cursor ?? theme.foreground ?? "#fff"}`,
      }}
      aria-hidden
    />
  );
}
