import { AppShell } from "@/components/app-shell";
import { CommandPalette } from "@/components/command-palette";

/** Authed route group: every view here is wrapped in the console chrome. */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <CommandPalette />
    </>
  );
}
