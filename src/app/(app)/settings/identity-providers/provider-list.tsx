"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, Power, PowerOff, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import type { OidcProviderSummary } from "@/lib/auth/oidc-providers";
import { deleteProvider, toggleProvider } from "./actions";
import { ProviderDialog } from "./provider-dialog";

export function ProviderList({
  providers,
  canManage,
}: {
  providers: OidcProviderSummary[];
  canManage: boolean;
}) {
  return (
    <Card>
      <Table>
        <TableHead>
          <Tr className="hover:bg-transparent">
            <Th className="pl-4">Provider</Th>
            <Th>Issuer</Th>
            <Th>Client ID</Th>
            <Th>Status</Th>
            <Th className="pr-4 text-right">
              <span className="sr-only">Actions</span>
            </Th>
          </Tr>
        </TableHead>
        <TableBody>
          {providers.map((provider) => (
            <ProviderRow key={provider.id} provider={provider} canManage={canManage} />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function ProviderRow({
  provider,
  canManage,
}: {
  provider: OidcProviderSummary;
  canManage: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onToggle() {
    startTransition(async () => {
      const result = await toggleProvider(provider.id, !provider.enabled);
      if (result.status === "error") setError(result.error);
    });
  }

  function onDelete() {
    startTransition(async () => {
      const result = await deleteProvider(provider.id);
      if (result.status === "success") setConfirmDelete(false);
      else setError(result.error);
    });
  }

  let issuerHost = provider.issuer;
  try {
    issuerHost = new URL(provider.issuer).host;
  } catch {
    // Keep the raw string (e.g. a placeholder like <tenant>) if it doesn't parse.
  }

  return (
    <Tr>
      <Td className="pl-4 font-medium text-ink">{provider.name}</Td>
      <Td data className="text-ink-muted" title={provider.issuer}>
        {issuerHost}
      </Td>
      <Td data className="text-ink-muted">
        {provider.clientId}
      </Td>
      <Td>
        <div className="flex flex-col gap-1">
          {canManage ? (
            <button
              type="button"
              onClick={onToggle}
              disabled={pending}
              className="inline-flex w-fit"
            >
              <Chip variant={provider.enabled ? "online" : "default"} mono>
                {provider.enabled ? "enabled" : "disabled"}
              </Chip>
            </button>
          ) : (
            <Chip variant={provider.enabled ? "online" : "default"} mono>
              {provider.enabled ? "enabled" : "disabled"}
            </Chip>
          )}
          {error && (
            <span className="flex items-center gap-1 text-xs text-critical-500">
              <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
              {error}
            </span>
          )}
        </div>
      </Td>
      <Td className="pr-4 text-right">
        {canManage ? (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Provider actions"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-control text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    setEditOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    onToggle();
                  }}
                >
                  {provider.enabled ? (
                    <PowerOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Power className="h-4 w-4" aria-hidden />
                  )}
                  {provider.enabled ? "Disable" : "Enable"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  destructive
                  onSelect={(event) => {
                    event.preventDefault();
                    setConfirmDelete(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Controlled: opened via the menu item above, no trigger of its own. */}
            <ProviderDialog
              provider={provider}
              open={editOpen}
              onOpenChange={setEditOpen}
            />
          </div>
        ) : (
          <span className="pr-1 text-xs text-ink-faint">—</span>
        )}
      </Td>

      <Dialog
        open={confirmDelete}
        onOpenChange={(next) => {
          setConfirmDelete(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete provider</DialogTitle>
            <DialogDescription>
              <span className="text-ink">{provider.name}</span> stops appearing on
              the login page immediately. Anyone who last signed in through it keeps
              their existing session, but can&apos;t start a new one this way. This
              can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p
              role="alert"
              className="mx-6 flex items-start gap-2 rounded-control border border-critical-500/40 bg-critical-500/10 px-3 py-2 text-xs text-critical-500"
            >
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="danger" size="sm" onClick={onDelete} disabled={pending}>
              {pending ? "Deleting…" : "Delete provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tr>
  );
}
