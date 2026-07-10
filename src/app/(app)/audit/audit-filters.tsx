"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Select } from "@/components/ui/field";
import { humanizeAction } from "./format";

export interface AuditFacets {
  actions: string[];
  targetTypes: string[];
  /** Actor options are pre-resolved on the server (the stable actor id as
   *  `value`, the person's current display name as `label`), since naming them
   *  needs an `app_user` join the client can't do. Filtering still matches on
   *  the id, so a person shows once with their whole history. */
  actors: { value: string; label: string }[];
}

export interface AuditFiltersProps {
  facets: AuditFacets;
  /** Currently active filter values (mirrors the URL, server-resolved). */
  active: {
    action?: string;
    targetType?: string;
    actor?: string;
  };
}

/**
 * Filter rail for the audit trail. Three Selects (action / target type / actor)
 * write their choice straight into the URL searchParams; the Server Component
 * re-queries from there. Changing any filter resets pagination to the first page.
 * A Clear control appears only while a filter is active.
 */
export function AuditFilters({ facets, active }: AuditFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hasActive = Boolean(active.action || active.targetType || active.actor);

  const update = React.useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (value) params.set(key, value);
      else params.delete(key);
      // Any filter change invalidates the current page offset.
      params.delete("page");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams],
  );

  const clear = React.useCallback(() => {
    router.push(pathname);
  }, [router, pathname]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <FilterSelect
        label="Action"
        value={active.action ?? ""}
        placeholder="All actions"
        options={facets.actions.map((value) => ({ value, label: humanizeAction(value) }))}
        onChange={(value) => update("action", value)}
      />
      <FilterSelect
        label="Target"
        value={active.targetType ?? ""}
        placeholder="All targets"
        options={facets.targetTypes.map((value) => ({ value, label: titleCase(value) }))}
        onChange={(value) => update("targetType", value)}
      />
      <FilterSelect
        label="Actor"
        value={active.actor ?? ""}
        placeholder="All actors"
        options={facets.actors}
        onChange={(value) => update("actor", value)}
      />
      {hasActive && (
        <button
          type="button"
          onClick={clear}
          className="inline-flex h-9 items-center gap-1.5 rounded-control px-2 text-xs font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Clear
        </button>
      )}
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

function FilterSelect({ label, value, placeholder, options, onChange }: FilterSelectProps) {
  const id = React.useId();
  return (
    <div className="flex min-w-[10rem] flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted"
      >
        {label}
      </label>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // Disabled when there is nothing to pick beyond "all".
        disabled={options.length === 0}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function titleCase(token: string): string {
  return token
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
