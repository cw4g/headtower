"use client";

import * as React from "react";
import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
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
 * (nothing to sign out of). When {@link collapsed} it shrinks to just the avatar
 * so it fits the icon rail; otherwise it shows the full-width identity (in the
 * expanded sidebar column and the mobile nav drawer alike).
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
            : "justify-start gap-1.5 px-2 py-1",
        )}
      >
        <Avatar account={account} />
        {!collapsed && <span>{account.roleLabel}</span>}
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
              : "w-full justify-start gap-2 py-1 pl-1 pr-2",
          )}
        >
          <Avatar account={account} />
          {!collapsed && (
            <span className="max-w-32 truncate">{account.name}</span>
          )}
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
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserRound className="h-4 w-4" aria-hidden />
            Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <SignOutItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Sign out. The action runs from the menu item's onSelect inside a transition.
 * A nested <form> submit button does not work here: Radix closes the menu on
 * select and unmounts the button before the browser fires the form submit, so
 * the request never leaves. Calling the server action directly avoids the race;
 * it clears the session + cookie and redirects to /login.
 */
function SignOutItem() {
  const [pending, startTransition] = React.useTransition();
  return (
    <DropdownMenuItem
      destructive
      disabled={pending}
      onSelect={(event) => {
        // Keep the menu mounted through the submit; the action redirects anyway.
        event.preventDefault();
        startTransition(async () => {
          await logout();
        });
      }}
    >
      <LogOut className="h-4 w-4" aria-hidden />
      {pending ? "Signing out" : "Sign out"}
    </DropdownMenuItem>
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
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface-2 text-[11px] font-medium text-ink-muted">
      {account.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
