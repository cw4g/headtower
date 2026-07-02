"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  AddDeviceDialogProps,
  AddDeviceMode,
  UserOption,
} from "./add-device-dialog";

/**
 * The Add device dialog, loaded on demand with no trigger fallback - this
 * handler only mounts it once a deep-link is actually present, so the heavy
 * chunk (and `qrcode`) stays out of the initial bundle until then.
 */
const AddDeviceDialog = dynamic<AddDeviceDialogProps>(
  () => import("./add-device-dialog").then((m) => m.AddDeviceDialog),
  { ssr: false, loading: () => null },
);

/**
 * Enrolment deep-link handler for the Machines page. Watches the URL for the
 * flags the command palette emits:
 *   - `?add=1`            → open Add device on the "create key" flow.
 *   - `?register=<key>`   → open it on the "register device" flow, key prefilled.
 *
 * The matching flag is captured into local state and immediately stripped from
 * the URL (via `replace`, so a refresh won't re-trigger and history isn't
 * spammed), then the controlled dialog opens. Closing it clears the state and
 * unmounts the dialog again.
 */
export function AddDeviceDeepLink({
  users,
  loginServerUrl,
}: {
  users: UserOption[];
  loginServerUrl: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const addParam = searchParams.get("add");
  const registerParam = searchParams.get("register");

  const [request, setRequest] = React.useState<{
    mode: AddDeviceMode;
    key?: string;
  } | null>(null);
  // The deep-link we've already acted on, so re-running the effect after we
  // strip the flag (or on any unrelated param change) doesn't reopen the dialog
  // - the same written-value guard `useMachinesFilter` uses to tame its effect.
  const handledRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const token = registerParam
      ? `register:${registerParam}`
      : addParam
        ? "add"
        : null;
    if (token === null) {
      // The flag is gone (we stripped it, or it was never there): clear the
      // guard so a fresh palette navigation to the same flag reopens the dialog.
      handledRef.current = null;
      return;
    }
    if (handledRef.current === token) return;
    handledRef.current = token;

    setRequest(
      registerParam
        ? { mode: "register", key: registerParam }
        : { mode: "create" },
    );

    // Strip only the enrolment flags, preserving any other active params
    // (the filter's q/status/user/tag), so a refresh won't reopen the dialog.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("add");
    params.delete("register");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [addParam, registerParam, pathname, router, searchParams]);

  if (!request) return null;

  return (
    <AddDeviceDialog
      users={users}
      loginServerUrl={loginServerUrl}
      open
      onOpenChange={(next) => {
        if (!next) setRequest(null);
      }}
      initialMode={request.mode}
      initialRegisterKey={request.key}
    />
  );
}
