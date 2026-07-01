"use client";

import * as React from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { SshTerminal } from "@/components/terminal/ssh-terminal";

export const DEFAULT_SSH_USER = "root";

export interface TerminalConsoleProps {
  /** Node hostname (MagicDNS) or tailnet IP the agent will dial on port 22. */
  host: string;
  /** SSH user to open the first session with — from `?user=`, or {@link DEFAULT_SSH_USER}. */
  defaultUser: string;
  className?: string;
}

/**
 * The interactive body of the dedicated terminal page: an SSH-user field
 * fronting a live {@link SshTerminal} session that fills the rest of the
 * page. Changing the user and hitting Connect tears down and reopens the
 * session (the `key` bump on {@link SshTerminal} forces a remount).
 */
export function TerminalConsole({ host, defaultUser, className }: TerminalConsoleProps) {
  const [user, setUser] = React.useState(defaultUser);
  const [session, setSession] = React.useState<{ user: string; key: number }>({
    user: defaultUser,
    key: 0,
  });

  function connect() {
    const trimmed = user.trim() || DEFAULT_SSH_USER;
    setUser(trimmed);
    setSession((prev) => ({ user: trimmed, key: prev.key + 1 }));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <Field label="SSH user" htmlFor="ssh-user-input" className="w-56">
          <Input
            id="ssh-user-input"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                connect();
              }
            }}
            mono
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </Field>
        <Button variant="outline" size="sm" onClick={connect} className="gap-1.5">
          <Zap className="h-3.5 w-3.5" aria-hidden />
          Connect
        </Button>
      </div>

      <SshTerminal key={session.key} host={host} user={session.user} className={className} />
    </div>
  );
}
