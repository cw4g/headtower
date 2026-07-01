import { AppShell } from "@/components/app-shell";
import { CommandPalette } from "@/components/command-palette";
import { sessionCapabilities } from "@/lib/authz";

// The console reports live, per-request state (session, effective config, and the
// needs-setup gate in AppShell). Never statically prerender any view in this
// group - otherwise a build-time redirect (e.g. to /setup when unconfigured)
// would be baked into an otherwise static route like /settings.
export const dynamic = "force-dynamic";

/** Authed route group: every view here is wrapped in the console chrome. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolve capabilities on the server so the palette can drop targets the
  // role can't even read. Plain booleans cross the client boundary safely.
  const capabilities = await sessionCapabilities();

  return (
    <>
      <AppShell>{children}</AppShell>
      <CommandPalette capabilities={capabilities} />
    </>
  );
}
