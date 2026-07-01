import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getConfig } from "@/lib/config";

// The wizard reflects live config state; never prerender it.
export const dynamic = "force-dynamic";

/**
 * First-run only. Once a Headscale connection exists (via env or a completed
 * wizard), /setup is locked and bounces to the console - so it can't be used to
 * re-point a live instance. Reconfiguration lives behind the authed settings.
 */
export default function SetupLayout({ children }: { children: ReactNode }) {
  if (getConfig().headscale) redirect("/");
  return children;
}
