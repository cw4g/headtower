import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, FilterX, ScrollText } from "lucide-react";
import { auditLog, db, type AuditEntry } from "@/lib/db";
import { listAudit } from "@/lib/audit";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { AuditFilters, type AuditFacets } from "./audit-filters";
import {
  humanizeAction,
  isoTimestamp,
  relativeTime,
  summarizeDetail,
  targetHref,
} from "./format";

// The audit trail is live local state read at request time; never prerender it.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/** Filters lifted out of the URL searchParams. */
interface ActiveFilters {
  action?: string;
  targetType?: string;
  actor?: string;
}

interface AuditView {
  entries: AuditEntry[];
  total: number;
  facets: AuditFacets;
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const filters: ActiveFilters = {
    action: firstValue(sp.action),
    targetType: firstValue(sp.targetType),
    actor: firstValue(sp.actor),
  };
  const page = Math.max(1, toInt(firstValue(sp.page), 1));
  const offset = (page - 1) * PAGE_SIZE;

  let view: AuditView | null = null;
  let error: string | null = null;
  try {
    view = await loadAudit(filters, offset);
  } catch {
    error = "Couldn't read the audit log. The local store may be unavailable.";
  }

  const entries = view?.entries ?? [];
  const total = view?.total ?? 0;
  const facets: AuditFacets = view?.facets ?? { actions: [], targetTypes: [], actors: [] };
  const hasFilters = Boolean(filters.action || filters.targetType || filters.actor);
  const hasAnyRows = total > 0 || hasFilters || facets.actions.length > 0;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const firstRow = total === 0 ? 0 : offset + 1;
  const lastRow = Math.min(offset + entries.length, total);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        eyebrow="Trail"
        title={
          <span className="inline-flex items-center gap-2.5">
            Audit
            {!error && (
              <Chip mono variant="default">
                {total}
              </Chip>
            )}
          </span>
        }
        description="Every operator action against the tailnet, newest first."
      >
        {!error && total > 0 && <ExportButton filters={filters} />}
      </SectionHeading>

      {error ? (
        <ErrorPanel message={error} />
      ) : !hasAnyRows ? (
        <EmptyState
          icon={ScrollText}
          title="No audit activity yet"
          description="Operator actions — renames, approvals, key changes — are recorded here as they happen."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <AuditFilters facets={facets} active={filters} />

          {entries.length === 0 ? (
            <EmptyState
              icon={FilterX}
              title="No entries match these filters"
              description="Widen or clear the filters above to see more of the trail."
            />
          ) : (
            <>
              <Card>
                <Table>
                  <TableHead>
                    <Tr className="hover:bg-transparent">
                      <Th>Time</Th>
                      <Th>Actor</Th>
                      <Th>Action</Th>
                      <Th>Target</Th>
                      <Th>Detail</Th>
                    </Tr>
                  </TableHead>
                  <TableBody>
                    {entries.map((entry) => (
                      <AuditRow key={entry.id} entry={entry} />
                    ))}
                  </TableBody>
                </Table>
              </Card>

              <Pagination
                filters={filters}
                page={currentPage}
                totalPages={totalPages}
                firstRow={firstRow}
                lastRow={lastRow}
                total={total}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Read the requested page plus the distinct facet values for the filter rail. */
async function loadAudit(filters: ActiveFilters, offset: number): Promise<AuditView> {
  const [pageResult, facets] = await Promise.all([
    listAudit({
      action: filters.action,
      targetType: filters.targetType,
      actor: filters.actor,
      limit: PAGE_SIZE,
      offset,
    }),
    loadFacets(),
  ]);
  return { entries: pageResult.entries, total: pageResult.total, facets };
}

/** Distinct, sorted values for each filterable column, for the Select options. */
async function loadFacets(): Promise<AuditFacets> {
  const [actions, targetTypes, actors] = await Promise.all([
    db
      .select({ value: auditLog.action })
      .from(auditLog)
      .groupBy(auditLog.action)
      .orderBy(auditLog.action),
    db
      .select({ value: auditLog.targetType })
      .from(auditLog)
      .groupBy(auditLog.targetType)
      .orderBy(auditLog.targetType),
    db
      .select({ value: auditLog.actor })
      .from(auditLog)
      .groupBy(auditLog.actor)
      .orderBy(auditLog.actor),
  ]);

  return {
    actions: nonEmpty(actions.map((row) => row.value)),
    targetTypes: nonEmpty(targetTypes.map((row) => row.value)),
    actors: nonEmpty(actors.map((row) => row.value)),
  };
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const tsDate = entry.ts instanceof Date ? entry.ts : new Date(entry.ts);
  const detail = summarizeDetail(entry.detail);

  return (
    <Tr>
      <Td data className="whitespace-nowrap text-ink-muted" title={isoTimestamp(tsDate)}>
        {relativeTime(tsDate)}
      </Td>
      <Td>
        <span className="data text-ink-muted">{entry.actor}</span>
      </Td>
      <Td>
        <span className="flex flex-col leading-tight">
          <span className="font-medium text-ink">{humanizeAction(entry.action)}</span>
          <span className="data text-xs text-ink-faint">{entry.action}</span>
        </span>
      </Td>
      <Td>
        <TargetCell entry={entry} />
      </Td>
      <Td>
        {detail ? (
          <span
            className="data block max-w-[28rem] truncate text-xs text-ink-muted"
            title={detail}
          >
            {detail}
          </span>
        ) : (
          <span className="text-ink-faint">·</span>
        )}
      </Td>
    </Tr>
  );
}

function TargetCell({ entry }: { entry: AuditEntry }) {
  if (!entry.targetType && !entry.targetName && !entry.targetId) {
    return <span className="text-ink-faint">·</span>;
  }

  const name = entry.targetName?.trim() || entry.targetId || "—";
  const href = targetHref(entry.targetType, entry.targetId);

  const body = (
    <span className="inline-flex items-baseline gap-1">
      {entry.targetType && <span className="text-ink-faint">{entry.targetType}:</span>}
      <span className="data text-ink">{name}</span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="transition-colors hover:text-beacon-500">
        {body}
      </Link>
    );
  }
  return body;
}

function ExportButton({ filters }: { filters: ActiveFilters }) {
  const qs = filterQuery(filters);
  const href = qs ? `/audit/export?${qs}` : "/audit/export";
  return (
    <a
      href={href}
      className="inline-flex h-9 select-none items-center gap-2 whitespace-nowrap rounded-control border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:border-ink-faint hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      <Download className="h-3.5 w-3.5" aria-hidden />
      Export CSV
    </a>
  );
}

function Pagination({
  filters,
  page,
  totalPages,
  firstRow,
  lastRow,
  total,
}: {
  filters: ActiveFilters;
  page: number;
  totalPages: number;
  firstRow: number;
  lastRow: number;
  total: number;
}) {
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <p className="data text-xs text-ink-faint">
        {firstRow}–{lastRow} of {total}
      </p>
      <div className="flex items-center gap-1">
        <PageLink filters={filters} page={page - 1} disabled={!hasPrev} label="Previous">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Prev
        </PageLink>
        <span className="data px-2 text-xs text-ink-muted">
          {page} / {totalPages}
        </span>
        <PageLink filters={filters} page={page + 1} disabled={!hasNext} label="Next">
          Next
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  filters,
  page,
  disabled,
  label,
  children,
}: {
  filters: ActiveFilters;
  page: number;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) {
  const base =
    "inline-flex h-8 select-none items-center gap-1 rounded-control border px-2.5 text-xs font-medium transition-colors";

  if (disabled) {
    return (
      <span
        aria-disabled
        className={cn(base, "border-line bg-surface text-ink-faint opacity-50")}
      >
        {children}
      </span>
    );
  }

  const qs = filterQuery(filters, page);
  return (
    <Link
      href={qs ? `/audit?${qs}` : "/audit"}
      aria-label={label}
      className={cn(
        base,
        "border-line-strong bg-surface text-ink hover:border-ink-faint hover:bg-surface-2",
      )}
    >
      {children}
    </Link>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="grid-field flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-critical-500/40 px-6 py-14 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-card border border-critical-500/30 bg-critical-500/10 text-critical-500">
        <ScrollText className="h-5 w-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">Couldn&apos;t load the audit trail</p>
        <p className="mx-auto max-w-sm text-xs text-ink-muted">{message}</p>
      </div>
      <a
        href="/audit"
        className="text-xs font-medium text-beacon-500 transition-colors hover:text-beacon-400"
      >
        Retry
      </a>
    </div>
  );
}

/** Build a querystring from the active filters, optionally pinning a page. */
function filterQuery(filters: ActiveFilters, page?: number): string {
  const params = new URLSearchParams();
  if (filters.action) params.set("action", filters.action);
  if (filters.targetType) params.set("targetType", filters.targetType);
  if (filters.actor) params.set("actor", filters.actor);
  if (page && page > 1) params.set("page", String(page));
  return params.toString();
}

/** First value of a (possibly repeated) searchParam, trimmed to non-empty. */
function firstValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Keep only non-empty string values, in their existing order. */
function nonEmpty(values: (string | null)[]): string[] {
  return values.filter((value): value is string => Boolean(value && value.trim()));
}
