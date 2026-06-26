"use client";

import { RouteError } from "@/components/route-error";

/** Last-resort boundary for the settings segment (renders in the content column). */
export default function SettingsSegmentError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} />;
}
