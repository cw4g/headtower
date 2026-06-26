import * as React from "react";
import { redirect } from "next/navigation";
import { ConsoleTopBar } from "@/components/console-top-bar";
import type { Account } from "@/components/account-menu";
import { getSession } from "@/lib/auth";
import { isOidcEnabled } from "@/lib/auth/oidc";
import { ROLE_LABELS } from "@/lib/rbac";

/**
 * The operator-console chrome: the schematic top bar over a grid-field canvas,
 * with the routed view rendered into the centred content column. Server
 * component - it resolves the session here so the top bar can show the account,
 * and performs the secure (db-backed) auth check that complements the proxy gate.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  // Secure check: in OIDC mode a missing/invalid session must not reach the app.
  // The proxy already does the optimistic redirect; this also catches a valid
  // cookie whose session row was revoked (e.g. signed out on another device).
  if (!session && isOidcEnabled()) {
    redirect("/login");
  }

  const account: Account | null = session
    ? {
        name: session.user.name,
        email: session.user.email ?? null,
        picture: session.user.picture ?? null,
        roleLabel: ROLE_LABELS[session.role],
        method: session.user.method,
      }
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <ConsoleTopBar account={account} />
      <main className="relative flex-1">
        <div
          className="grid-field pointer-events-none absolute inset-0"
          aria-hidden
        />
        <div className="relative mx-auto w-full max-w-[1400px] px-4 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
