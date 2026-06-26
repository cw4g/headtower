import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface FieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Labelled form row: micro-label, control, then description or error. */
export function Field({
  label,
  htmlFor,
  description,
  error,
  required,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label != null && (
        <label
          htmlFor={htmlFor}
          className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted"
        >
          {label}
          {required && <span className="ml-0.5 text-critical-500">*</span>}
        </label>
      )}
      {children}
      {error != null ? (
        <p className="text-xs text-critical-500">{error}</p>
      ) : description != null ? (
        <p className="text-xs text-ink-faint">{description}</p>
      ) : null}
    </div>
  );
}

const controlBase =
  "h-9 w-full rounded-control border bg-surface-2 px-3 text-sm text-ink transition-colors placeholder:text-ink-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40 disabled:pointer-events-none disabled:opacity-50";

export interface InputProps extends React.ComponentProps<"input"> {
  invalid?: boolean;
  /** mono + tabular — for IPs, keys, IDs. */
  mono?: boolean;
}
export function Input({ className, invalid, mono, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        controlBase,
        invalid
          ? "border-critical-500"
          : "border-line-strong focus-visible:border-beacon-500",
        mono && "data",
        className,
      )}
      {...props}
    />
  );
}

export interface SelectProps extends React.ComponentProps<"select"> {
  invalid?: boolean;
}
export function Select({ className, invalid, children, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        className={cn(
          controlBase,
          "appearance-none pr-9",
          invalid
            ? "border-critical-500"
            : "border-line-strong focus-visible:border-beacon-500",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
        aria-hidden
      />
    </div>
  );
}
