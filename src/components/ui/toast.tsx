"use client";

import * as React from "react";
import { CheckCircle2, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Toast/success-feedback system - self-contained, no external deps.
 *
 * The store lives at module scope so any client component can fire a toast
 * imperatively (`toast("Machine renamed")`, `toast.error("Couldn't save")`)
 * without threading state through props. `<ToastViewport />` (mounted once in
 * `AppShell`) subscribes to the store with `useSyncExternalStore` and renders
 * the stack; it's the only piece of this file that needs to be a component.
 */

type ToastVariant = "success" | "error";

interface ToastRecord {
  id: string;
  message: string;
  variant: ToastVariant;
}

export interface ToastOptions {
  /** Auto-dismiss delay in ms. 0 disables auto-dismiss. Defaults to ~4s. */
  duration?: number;
}

const DEFAULT_DURATION = 4000;

let toasts: ToastRecord[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return toasts;
}

/** Dismiss a toast before its auto-dismiss timer fires. */
function dismiss(id: string) {
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function push(variant: ToastVariant, message: string, options?: ToastOptions): string {
  const id = `toast-${++seq}`;
  toasts = [...toasts, { id, message, variant }];
  emit();
  const duration = options?.duration ?? DEFAULT_DURATION;
  if (duration > 0) {
    setTimeout(() => dismiss(id), duration);
  }
  return id;
}

export interface ToastFn {
  /** Fire a success toast - the common case, so it's the bare call. */
  (message: string, options?: ToastOptions): string;
  success: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const toastFn = ((message, options) => push("success", message, options)) as ToastFn;
toastFn.success = (message, options) => push("success", message, options);
toastFn.error = (message, options) => push("error", message, options);
toastFn.dismiss = dismiss;

/** Imperative toast API - `toast("...")` for success, `toast.error("...")` for failure. */
export const toast = toastFn;

const VARIANT_META: Record<
  ToastVariant,
  { icon: LucideIcon; iconClass: string }
> = {
  success: { icon: CheckCircle2, iconClass: "text-beacon-500" },
  error: { icon: TriangleAlert, iconClass: "text-critical-500" },
};

/**
 * The fixed, corner-anchored toast stack. Mount once (see `AppShell`) - every
 * `toast(...)` call anywhere in the client tree renders here. `aria-live`
 * announces new toasts to assistive tech; motion is handled by the app-wide
 * `prefers-reduced-motion` rule in globals.css, so no JS branching is needed
 * here for that.
 */
export function ToastViewport() {
  const items = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-end px-4 pb-4 sm:px-6"
      aria-live="polite"
      aria-atomic="false"
    >
      <ol className="flex w-full max-w-sm flex-col-reverse gap-2">
        {items.map((item) => (
          <ToastCard key={item.id} toast={item} />
        ))}
      </ol>
    </div>
  );
}

function ToastCard({ toast: item }: { toast: ToastRecord }) {
  const meta = VARIANT_META[item.variant];
  const Icon = meta.icon;

  // No animation library here (this component is dependency-free), so the
  // entrance is a plain CSS transition driven by a state flip on the next
  // frame - a transition never runs on a value's own initial render. The
  // global `prefers-reduced-motion` rule in globals.css collapses this
  // transition's duration for operators who've asked for less motion.
  const [entered, setEntered] = React.useState(false);
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <li
      className={cn(
        "pointer-events-auto flex items-start gap-2 rounded-card border border-line-strong bg-surface px-3.5 py-3 shadow-2xl shadow-graphite-950/30",
        "transition-[opacity,transform] duration-200 ease-out",
        entered ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.iconClass)} aria-hidden />
      <p className="flex-1 text-xs leading-relaxed text-ink">{item.message}</p>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label="Dismiss notification"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[0.3rem] text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/50"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </li>
  );
}
