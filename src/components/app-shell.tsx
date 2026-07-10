import * as React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BeaconMark } from "@/components/beacon-mark";
import { ConsoleSidebar } from "@/components/console-sidebar";
import { MobileNavDrawer } from "@/components/mobile-nav-drawer";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { Kbd } from "@/components/ui/kbd";
import { ToastViewport } from "@/components/ui/toast";
import type { Account } from "@/components/account-menu";
import { getSession } from "@/lib/auth";
import { isOidcEnabled } from "@/lib/auth/oidc";
import { getConfig } from "@/lib/config";
import { ROLE_LABELS } from "@/lib/rbac";
import { SIDEBAR_COOKIE, normalizeSidebarCollapsed } from "@/lib/sidebar";
import { THEME_COOKIE, normalizeTheme } from "@/lib/theme";
import { APP_VERSION, checkForUpdate } from "@/lib/version";

/**
 * The operator-console chrome: the schematic collapsible sidebar beside a
 * scrollable, grid-field content area whose centred column hosts the routed
 * view. Server component - it resolves the session here so the sidebar can show
 * the account, and performs the secure (db-backed) auth check that complements
 * the proxy gate.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  // Needs-setup gate: with no Headscale connection (neither env nor UI-set), the
  // console can't report anything, so send the operator to the first-run wizard.
  // This is the authoritative, DB-aware check; the proxy only allow-lists /setup.
  if (!getConfig().headscale) {
    redirect("/setup");
  }

  const session = await getSession();

  const cookieStore = await cookies();

  // The saved theme, read once here so the sidebar toggle renders its active
  // segment correctly on the first paint (the inline script resolves the same
  // cookie for the page itself). Falls back to the dark default when unset.
  const theme = normalizeTheme(cookieStore.get(THEME_COOKIE)?.value);

  // The persisted sidebar width, so the first server render matches the operator's
  // last choice and the rail doesn't flash open/closed on load.
  const collapsed = normalizeSidebarCollapsed(
    cookieStore.get(SIDEBAR_COOKIE)?.value,
  );

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

  // Informational, not gated by role - every operator benefits from knowing a
  // newer build exists. Fails quiet (see @/lib/version), so an offline check
  // never blocks the shell from rendering.
  const update = await checkForUpdate();

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <ConsoleSidebar
        account={account}
        theme={theme}
        initialCollapsed={collapsed}
        appVersion={APP_VERSION}
        updateAvailable={update.available}
        latestVersion={update.latestVersion}
      />
      <main className="grid-field relative flex min-w-0 flex-1 flex-col overflow-y-auto">
        {/* Mobile header: the icon rail alongside has no room for labels below
            `md`, and its tooltips need hover, which touch can't give it. This
            hamburger opens `MobileNavDrawer`, the full-label equivalent. */}
        <div className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 md:hidden">
          <MobileNavDrawer
            account={account}
            theme={theme}
            appVersion={APP_VERSION}
            updateAvailable={update.available}
            latestVersion={update.latestVersion}
          />
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
            <BeaconMark className="h-5 w-5 shrink-0" />
            head<span className="text-ink-muted">tower</span>
          </span>
        </div>
        <div className="relative mx-auto w-full max-w-[1400px] px-4 py-6">
          {/* Quiet Cmd-K nudge: the palette is otherwise easy to miss, so a
              small chip advertises it at the top of every view. Hidden below
              `md` alongside the desktop sidebar it complements - touch has no
              keyboard shortcut to teach, and the mobile header owns that row. */}
          <div className="mb-4 hidden items-center justify-end gap-1.5 text-[11px] text-ink-faint md:flex">
            <span>Jump anywhere</span>
            <Kbd>⌘K</Kbd>
          </div>
          {children}
        </div>
      </main>
      <ToastViewport />
      <ShortcutsHelp />
    </div>
  );
}
