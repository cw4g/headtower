"use client";

import { RouteError } from "@/components/route-error";

/** Last-resort boundary for the dns segment. */
export default function DnsError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} />;
}
