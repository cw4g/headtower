"use client";

/**
 * Browser SSH terminal: mints a short-lived token via the `mintSshToken`
 * Server Action, opens a websocket to the Headtower agent's SSH bridge, and
 * mounts an xterm.js terminal wired to it.
 *
 * Wire protocol (must match `agent/ssh.go`):
 *   client -> agent   binary frame  = raw stdin bytes
 *   client -> agent   text frame    = `{"type":"resize","cols":N,"rows":N}`
 *   agent -> client   binary frame  = stdout/stderr bytes
 *   agent -> client   text frame    = `{"type":"error","message":"..."}` or
 *                                     `{"type":"exit","code":N}` (both close)
 */

import * as React from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { TriangleAlert } from "lucide-react";
import { mintSshToken } from "@/app/(app)/machines/[id]/terminal/actions";
import { cn } from "@/lib/cn";

export interface SshTerminalProps {
  /** Node hostname (MagicDNS) or tailnet IP to dial on port 22. */
  host: string;
  /** SSH user to present to the target. */
  user: string;
  className?: string;
}

type ConnectionState = "connecting" | "connected" | "closed" | "error";

const STATE_LABEL: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  closed: "Session closed",
  error: "Connection error",
};

const STATE_DOT: Record<ConnectionState, string> = {
  connecting: "bg-warn-500 animate-pulse",
  connected: "bg-online-500",
  closed: "bg-ink-faint",
  error: "bg-critical-500",
};

/** Read a resolved CSS custom property off the root element, for the canvas
 *  theme (which needs literal colors, not `var(...)`). */
function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/**
 * The terminal's own ANSI 16-color palette. Distinct from the console's
 * schematic "one accent" chrome by necessity - real shell output (ls, git,
 * vim, htop...) relies on a full palette to stay legible - but anchored to
 * the console's surface/ink for background and text, and beacon for cursor.
 */
function buildTheme(): ITheme {
  const background = cssVar("--surface-2", "#1f262e");
  const foreground = cssVar("--ink", "#e6edf3");
  return {
    background,
    foreground,
    cursor: "#f5b544",
    cursorAccent: background,
    selectionBackground: "rgba(245, 181, 68, 0.25)",
    black: background,
    brightBlack: cssVar("--ink-faint", "#646f7d"),
    white: foreground,
    brightWhite: "#ffffff",
    red: "#f43f5e",
    brightRed: "#fb7185",
    green: "#34d399",
    brightGreen: "#6ee7b7",
    yellow: "#f5b544",
    brightYellow: "#ffd98a",
    blue: "#60a5fa",
    brightBlue: "#93c5fd",
    magenta: "#c084fc",
    brightMagenta: "#d8b4fe",
    cyan: "#22d3ee",
    brightCyan: "#67e8f9",
  };
}

/** `${wss|ws}://${host}${path}?token=...` - the agent websocket, reached
 *  through the app's own origin (nginx proxies the base-path `path`). */
function wsUrl(path: string, token: string): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}${path}?token=${encodeURIComponent(token)}`;
}

interface AgentTextMessage {
  type?: string;
  message?: string;
  code?: number;
}

/** A live SSH session in an xterm.js terminal, bridged over the agent's websocket. */
export function SshTerminal({ host, user, className }: SshTerminalProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [state, setState] = React.useState<ConnectionState>("connecting");
  const [detail, setDetail] = React.useState<string | null>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setState("connecting");
    setDetail(null);

    let cancelled = false;
    let socket: WebSocket | null = null;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontSize: 13,
      lineHeight: 1.2,
      fontFamily:
        'var(--font-mono), ui-monospace, "SF Mono", Menlo, monospace',
      scrollback: 5000,
      theme: buildTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    /** Re-fit the terminal to its container, and tell the agent when connected. */
    function syncSize() {
      fit.fit();
      if (socket?.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    }

    async function connect() {
      const result = await mintSshToken(host, user);
      if (cancelled) return;
      if (!result.ok) {
        setState("error");
        setDetail(result.error);
        term.writeln(`\x1b[31mConnection refused: ${result.error}\x1b[0m`);
        return;
      }

      const ws = new WebSocket(wsUrl(result.path, result.token));
      ws.binaryType = "arraybuffer";
      socket = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setState("connected");
        setDetail(null);
        syncSize();
        term.focus();
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        if (typeof event.data === "string") {
          let msg: AgentTextMessage;
          try {
            msg = JSON.parse(event.data) as AgentTextMessage;
          } catch {
            return; // not a control frame we understand; ignore
          }
          if (msg.type === "error") {
            setState("error");
            setDetail(msg.message ?? "The agent reported an error.");
            term.writeln(`\r\n\x1b[31m${msg.message ?? "Session error."}\x1b[0m`);
          } else if (msg.type === "exit") {
            setState("closed");
            setDetail(`Shell exited (code ${msg.code ?? 0}).`);
            term.writeln(`\r\n\x1b[2m[session ended, exit code ${msg.code ?? 0}]\x1b[0m`);
          }
          return;
        }
        term.write(new Uint8Array(event.data as ArrayBuffer));
      };

      ws.onerror = () => {
        if (cancelled) return;
        setState("error");
        setDetail((prev) => prev ?? "The websocket connection failed.");
      };

      ws.onclose = () => {
        if (cancelled) return;
        // A prior error/exit control frame already set the terminal state;
        // don't downgrade "error" back to a plain "closed".
        setState((prev) => (prev === "error" ? prev : "closed"));
      };
    }

    const dataListener = term.onData((data) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(new TextEncoder().encode(data));
      }
    });

    let resizeFrame = 0;
    const resizeObserver = new ResizeObserver(() => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(syncSize);
    });
    resizeObserver.observe(container);

    void connect();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      dataListener.dispose();
      socket?.close();
      term.dispose();
    };
  }, [host, user]);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-card border border-line-strong bg-surface-2",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-3 py-1.5">
        <span className="data text-xs text-ink-muted">
          <span className="text-ink">{user}</span>@<span className="text-ink">{host}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", STATE_DOT[state])} aria-hidden />
          <span className="text-xs text-ink-muted">{STATE_LABEL[state]}</span>
        </span>
      </div>
      {detail && state !== "connected" && (
        <p className="flex shrink-0 items-start gap-1.5 border-b border-line bg-critical-500/10 px-3 py-2 text-xs text-critical-500">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{detail}</span>
        </p>
      )}
      <div ref={containerRef} className="min-h-0 flex-1 p-2" />
    </div>
  );
}
