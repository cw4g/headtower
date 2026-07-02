"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CreatePreAuthKeyDialog,
  type UserOption,
} from "./create-pre-auth-key-dialog";

const PATH = "/settings/pre-auth-keys";

/**
 * Thin client mount around `CreatePreAuthKeyDialog` that auto-opens it when
 * the page is reached with `?create=1` - the landing spot for the command
 * palette's "Create pre-auth key" quick action.
 *
 * `CreatePreAuthKeyDialog` (owned by another workstream) has no controlled-open
 * prop, so rather than edit it this renders it exactly as it renders itself
 * and, on the flag's first render, programmatically clicks whichever trigger
 * button it mounted - indistinguishable from the operator clicking "Create
 * key" themselves. The flag is then stripped from the URL so a refresh or
 * back-navigation doesn't reopen the dialog.
 */
export function CreatePreAuthKeyFlag({
  users,
  autoOpen,
}: {
  users: UserOption[];
  autoOpen: boolean;
}) {
  const router = useRouter();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const handled = React.useRef(false);

  React.useEffect(() => {
    if (!autoOpen || handled.current) return;
    handled.current = true;
    containerRef.current?.querySelector("button")?.click();
    router.replace(PATH, { scroll: false });
  }, [autoOpen, router]);

  return (
    <div ref={containerRef} className="contents">
      <CreatePreAuthKeyDialog users={users} />
    </div>
  );
}
