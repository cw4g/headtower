"use client";

import { RouteError } from "@/components/route-error";

/** Last-resort boundary for the access segment. */
export default function AccessError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} />;
}
