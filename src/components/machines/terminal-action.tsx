"use client";

import * as React from "react";
import { SquareTerminal, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog";
import { SshTerminal } from "@/components/terminal/ssh-terminal";

/** Local-only: the last SSH user used from this browser, offered as the default. */
const LAST_USER_KEY = "ht_ssh_last_user";
const DEFAULT_USER = "root";

export interface TerminalActionProps {
  /** Node hostname (MagicDNS) or tailnet IP the agent will dial on port 22. */
  host: string;
  /** Operator-facing node name, shown in the dialog title. */
  name: string;
}

/**
 * "Terminal" action for a node's detail page: opens a wide dialog holding a
 * live SSH session ({@link SshTerminal}), fronted by an SSH-user field that
 * remembers the last user tried on this browser.
 */
export function TerminalAction({ host, name }: TerminalActionProps) {
  const [open, setOpen] = React.useState(false);
  const [user, setUser] = React.useState(DEFAULT_USER);
  const [session, setSession] = React.useState<{ user: string; key: number }>({
    user: DEFAULT_USER,
    key: 0,
  });

  // Load the remembered user once the dialog is first opened, then start a
  // session with it - open the terminal and get a shell without an extra click.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    const remembered = window.localStorage.getItem(LAST_USER_KEY)?.trim();
    const initial = remembered || DEFAULT_USER;
    setUser(initial);
    setSession((prev) => ({ user: initial, key: prev.key + 1 }));
  }

  function connect() {
    const trimmed = user.trim() || DEFAULT_USER;
    window.localStorage.setItem(LAST_USER_KEY, trimmed);
    setUser(trimmed);
    setSession((prev) => ({ user: trimmed, key: prev.key + 1 }));
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => handleOpenChange(true)}
      >
        <SquareTerminal className="h-4 w-4" aria-hidden />
        Terminal
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-4xl w-[min(94vw,64rem)]" showClose>
          <DialogHeader>
            <DialogTitle>SSH terminal</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-ink">{name}</span> via the
              Headtower agent, over the tailnet.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <div className="flex items-end gap-2">
              <Field label="SSH user" htmlFor="ssh-user-input" className="w-44">
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

            {open && (
              <SshTerminal
                key={session.key}
                host={host}
                user={session.user}
                className="h-[32rem]"
              />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
