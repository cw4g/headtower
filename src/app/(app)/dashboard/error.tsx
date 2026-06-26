"use client";

import { RouteError } from "@/components/route-error";

/** Last-resort boundary for the dashboard segment. */
export default function DashboardError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} />;
}
