import * as React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ConsoleTopBar } from "@/components/console-top-bar";
import type { Account } from "@/components/account-menu";
import { getSession } from "@/lib/auth";
import { isOidcEnabled } from "@/lib/auth/oidc";
import { getConfig } from "@/lib/config";
import { ROLE_LABELS } from "@/lib/rbac";
import { THEME_COOKIE, normalizeTheme } from "@/lib/theme";

/**
 * The operator-console chrome: the schematic top bar over a grid-field canvas,
 * with the routed view rendered into the centred content column. Server
 * component - it resolves the session here so the top bar can show the account,
 * and performs the secure (db-backed) auth check that complements the proxy gate.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  // Needs-setup gate: with no Headscale connection (neither env nor UI-set), the
  // console can't report anything, so send the operator to the first-run wizard.
  // This is the authoritative, DB-aware check; the proxy only allow-lists /setup.
  if (!getConfig().headscale) {
    redirect("/setup");
  }

  const session = await getSession();

  // The saved theme, read once here so the top-bar toggle renders its active
  // segment correctly on the first paint (the inline script resolves the same
  // cookie for the page itself). Falls back to the dark default when unset.
  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);

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
      <ConsoleTopBar account={account} theme={theme} />
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
