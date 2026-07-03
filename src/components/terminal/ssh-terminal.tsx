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
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { TriangleAlert } from "lucide-react";
import { mintSshToken } from "@/app/(app)/machines/[id]/terminal/actions";
import { resolveTheme } from "@/components/terminal/terminal-themes";
import { cn } from "@/lib/cn";

export type ConnectionState = "connecting" | "connected" | "closed" | "error";

export const STATE_LABEL: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  closed: "Session closed",
  error: "Connection error",
};

export const STATE_DOT: Record<ConnectionState, string> = {
  connecting: "bg-warn-500 animate-pulse",
  connected: "bg-online-500",
  closed: "bg-ink-faint",
  error: "bg-critical-500",
};

export interface SshTerminalProps {
  /** Node hostname (MagicDNS) or tailnet IP to dial on port 22. */
  host: string;
  /** SSH user to present to the target. */
  user: string;
  /** Terminal color-scheme id (see terminal-themes). */
  themeId: string;
  /** Notifies the parent chrome (toolbar status dot) of connection changes. */
  onStatusChange?: (state: ConnectionState) => void;
  /** Incrementing this clears the terminal scrollback (toolbar "Clear"). */
  clearSignal?: number;
  className?: string;
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
export function SshTerminal({
  host,
  user,
  themeId,
  onStatusChange,
  clearSignal = 0,
  className,
}: SshTerminalProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const termRef = React.useRef<Terminal | null>(null);
  // The theme at mount time, for the initial paint, without themeId becoming a
  // dependency of the connect effect (a theme change must never reconnect). Its
  // initializer captures the current value; live changes are handled by the
  // in-place re-theme effect below, so a slightly stale start is corrected at
  // once and never observed.
  const themeIdRef = React.useRef(themeId);
  const [state, setState] = React.useState<ConnectionState>("connecting");
  const [detail, setDetail] = React.useState<string | null>(null);

  // Bubble connection state to the parent toolbar's status indicator.
  React.useEffect(() => {
    onStatusChange?.(state);
  }, [state, onStatusChange]);

  // Re-theme a live terminal in place - theme changes must not drop the shell.
  React.useEffect(() => {
    if (termRef.current) termRef.current.options.theme = resolveTheme(themeId);
  }, [themeId]);

  // Clear scrollback on demand (toolbar "Clear"); the initial 0 is a no-op.
  React.useEffect(() => {
    if (clearSignal > 0) termRef.current?.clear();
  }, [clearSignal]);

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
      theme: resolveTheme(themeIdRef.current),
    });
    termRef.current = term;
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
      termRef.current = null;
    };
  }, [host, user]);

  const themeBackground = resolveTheme(themeId).background ?? undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {detail && state !== "connected" && (
        <p className="flex shrink-0 items-start gap-1.5 border-b border-line bg-critical-500/10 px-3 py-2 text-xs text-critical-500">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{detail}</span>
        </p>
      )}
      {/* The terminal fills a BOUNDED parent (see TerminalConsole's fixed
          height). Its own background is painted to match the active theme so
          the padding around the xterm canvas doesn't flash the card surface. */}
      <div
        ref={containerRef}
        className={cn("min-h-0 flex-1 overflow-hidden p-2", className)}
        style={{ background: themeBackground }}
      />
      <span className="sr-only" role="status">
        {STATE_LABEL[state]}
      </span>
    </div>
  );
}
