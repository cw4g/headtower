import { AppShell } from "@/components/app-shell";
import { CommandPalette } from "@/components/command-palette";
import { sessionCapabilities } from "@/lib/authz";

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
