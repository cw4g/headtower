"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { matchingOidcPreset, OIDC_PROVIDER_PRESETS } from "@/lib/oidc-presets";
import { addProvider, editProvider } from "./actions";
import type { OidcProviderSummary } from "@/lib/auth/oidc-providers";

export interface ProviderDialogProps {
  /** Edit an existing provider, or omit to add a new one. */
  provider?: OidcProviderSummary;
  /** Custom trigger; defaults to an "Add provider" button (create mode only). */
  trigger?: React.ReactNode;
  /**
   * Controlled open state, for callers that open the dialog from elsewhere
   * (e.g. a row's dropdown "Edit" item) instead of a trigger rendered here. When
   * provided, no `DialogTrigger` is rendered - the caller owns opening it.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Add/edit dialog for an OIDC provider row. Create mode leads with a preset
 * picker (prefills the Issuer field only, never client id/secret - the same
 * presets as the legacy Settings > Authentication form). Edit mode preloads
 * the provider's fields and masks the stored secret behind a "Change secret"
 * control, matching the authentication form's rotate pattern.
 */
export function ProviderDialog({
  provider,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: ProviderDialogProps) {
  const isEdit = provider != null;
  const controlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlled ? controlledOpen : uncontrolledOpen;
  const [name, setName] = useState(provider?.name ?? "");
  const [issuer, setIssuer] = useState(provider?.issuer ?? "");
  const [clientId, setClientId] = useState(provider?.clientId ?? "");
  const [changingSecret, setChangingSecret] = useState(!isEdit);
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName(provider?.name ?? "");
    setIssuer(provider?.issuer ?? "");
    setClientId(provider?.clientId ?? "");
    setChangingSecret(!isEdit);
    setClientSecret("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (controlled) setControlledOpen?.(next);
    else setUncontrolledOpen(next);
    if (!next) reset();
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = isEdit
        ? await editProvider(provider.id, {
            name,
            issuer,
            clientId,
            clientSecret: changingSecret ? clientSecret : undefined,
          })
        : await addProvider({ name, issuer, clientId, clientSecret });
      if (result.status === "error") {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
    });
  }

  const activePreset = matchingOidcPreset(issuer);
  const canSubmit =
    name.trim().length > 0 &&
    issuer.trim().length > 0 &&
    clientId.trim().length > 0 &&
    (!changingSecret || clientSecret.trim().length > 0 || isEdit);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!controlled && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="solid" size="sm">
              <Plus className="h-4 w-4" aria-hidden />
              Add provider
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit provider" : "Add identity provider"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Shown as its own button on the login page when enabled."
                : "Adds another button to the login page, alongside any others already configured."}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-4">
            {!isEdit && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">
                  Preset
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {OIDC_PROVIDER_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setIssuer(preset.issuer);
                        if (!name.trim() || OIDC_PROVIDER_PRESETS.some((p) => p.label === name)) {
                          setName(preset.label);
                        }
                      }}
                      className={cn(
                        "rounded-control border px-2.5 py-1 text-xs transition-colors",
                        activePreset === preset.id
                          ? "border-beacon-500 bg-beacon-500/10 text-beacon-500"
                          : "border-line-strong bg-surface text-ink-muted hover:bg-surface-2 hover:text-ink",
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {activePreset && (
                  <p className="text-xs text-ink-faint">
                    {OIDC_PROVIDER_PRESETS.find((p) => p.id === activePreset)?.hint}
                  </p>
                )}
              </div>
            )}

            <Field label="Display name" htmlFor="provider-name">
              <Input
                id="provider-name"
                value={name}
                spellCheck={false}
                autoComplete="off"
                placeholder="Google"
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field label="Issuer URL" htmlFor="provider-issuer">
              <Input
                id="provider-issuer"
                mono
                value={issuer}
                spellCheck={false}
                autoComplete="off"
                placeholder="https://accounts.example.com"
                onChange={(e) => setIssuer(e.target.value)}
              />
            </Field>

            <Field label="Client ID" htmlFor="provider-client-id">
              <Input
                id="provider-client-id"
                mono
                value={clientId}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => setClientId(e.target.value)}
              />
            </Field>

            <Field
              label="Client secret"
              htmlFor="provider-secret"
              description={
                changingSecret ? "Stored encrypted when HEADTOWER_SECRET is set." : undefined
              }
            >
              {changingSecret ? (
                <div className="flex flex-col gap-2">
                  <Input
                    id="provider-secret"
                    mono
                    type="password"
                    value={clientSecret}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder={isEdit ? "Paste a new secret" : "Client secret"}
                    onChange={(e) => setClientSecret(e.target.value)}
                  />
                  {isEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setChangingSecret(false);
                        setClientSecret("");
                      }}
                      className="inline-flex w-fit text-xs text-ink-muted transition-colors hover:text-ink"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-control border border-line-strong bg-surface-2 px-3 py-2">
                  <span className="text-sm text-ink">A secret is stored</span>
                  <button
                    type="button"
                    onClick={() => setChangingSecret(true)}
                    className="text-xs font-medium text-beacon-500 transition-colors hover:text-beacon-400"
                  >
                    Change secret
                  </button>
                </div>
              )}
            </Field>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-control border border-critical-500/40 bg-critical-500/10 px-3 py-2 text-xs text-critical-500"
              >
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {error}
              </p>
            )}
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" size="sm" disabled={!canSubmit || pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add provider"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
