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
import { cn } from "@/lib/cn";

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
 * The sidebar-footer account control. In OIDC mode it's a dropdown with the
 * identity and a Sign out action; in operator mode it's a static role chip
 * (nothing to sign out of). When {@link collapsed} (or below `md`) it shrinks to
 * just the avatar so it fits the icon rail.
 */
export function AccountMenu({
  account,
  collapsed = false,
}: {
  account: Account;
  collapsed?: boolean;
}) {
  if (account.method !== "oidc") {
    return (
      <span
        title={collapsed ? account.roleLabel : undefined}
        className={cn(
          "flex items-center rounded-control border border-line bg-surface-2 text-xs text-ink-muted",
          collapsed
            ? "justify-center p-1"
            : "justify-center p-1 md:justify-start md:gap-1.5 md:px-2 md:py-1",
        )}
      >
        <Avatar account={account} />
        <span className={cn(collapsed ? "hidden" : "hidden md:inline")}>
          {account.roleLabel}
        </span>
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account"
          title={collapsed ? account.name : undefined}
          className={cn(
            "flex items-center rounded-control border border-line-strong bg-surface-2 text-sm text-ink-muted transition-colors hover:border-ink-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40",
            collapsed
              ? "justify-center p-1"
              : "w-full justify-center p-1 md:justify-start md:gap-2 md:py-1 md:pl-1 md:pr-2",
          )}
        >
          <Avatar account={account} />
          <span
            className={cn(
              "max-w-32 truncate",
              collapsed ? "hidden" : "hidden md:inline",
            )}
          >
            {account.name}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-56">
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
