"use client";

import { RouteError } from "@/components/route-error";

/** Last-resort boundary for the users segment. */
export default function UsersError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} />;
}
