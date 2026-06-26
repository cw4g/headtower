"use client";

import { RouteError } from "@/components/route-error";

/** Last-resort boundary for the audit segment. */
export default function AuditError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} />;
}
