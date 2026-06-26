import { AppShell } from "@/components/app-shell";

/** Authed route group: every view here is wrapped in the console chrome. */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
