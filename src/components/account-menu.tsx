"use client";

import * as React from "react";
import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/app/logout/actions";

/** The signed-in principal, as resolved on the server and passed down. */
export interface Account {
  name: string;
  email: string | null;
  picture: string | null;
  /** Human role label, e.g. "Owner" / "Operator". */
  roleLabel: string;
  /** How the session was established. Operator mode has no sign-out. */
  method: "api_key" | "oidc";
}

/**
 * The top-bar account control. In OIDC mode it's a dropdown with the identity
 * and a Sign out action; in operator mode it's a static role chip (nothing to
 * sign out of).
 */
export function AccountMenu({ account }: { account: Account }) {
  if (account.method !== "oidc") {
    return (
      <span className="hidden items-center gap-1.5 rounded-control border border-line bg-surface-2 px-2 py-1 text-xs text-ink-muted sm:inline-flex">
        <Avatar account={account} />
        {account.roleLabel}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account"
          className="flex items-center gap-2 rounded-control border border-line-strong bg-surface-2 py-1 pl-1 pr-2 text-sm text-ink-muted transition-colors hover:border-ink-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
        >
          <Avatar account={account} />
          <span className="hidden max-w-32 truncate sm:inline">{account.name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="normal-case">
          <span className="block truncate text-sm font-medium text-ink">
            {account.name}
          </span>
          {account.email && (
            <span className="data block truncate text-xs font-normal tracking-normal text-ink-faint">
              {account.email}
            </span>
          )}
        </DropdownMenuLabel>
        <div className="px-2 pb-1.5 text-[11px] uppercase tracking-[0.08em] text-ink-faint">
          {account.roleLabel}
        </div>
        <DropdownMenuSeparator />
        <form action={logout}>
          <DropdownMenuItem destructive asChild>
            <button type="submit" className="w-full">
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Avatar image when the provider supplies one, else the name's initial. */
function Avatar({ account }: { account: Account }) {
  if (account.picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external IdP avatar, no static optimization.
      <img
        src={account.picture}
        alt=""
        referrerPolicy="no-referrer"
        className="h-6 w-6 rounded-full border border-line object-cover"
      />
    );
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-line bg-graphite-800 text-[11px] font-medium text-ink-muted">
      {account.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
