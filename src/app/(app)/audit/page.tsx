import type { ReactNode } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FilterX,
  ScrollText,
  SquareTerminal,
} from "lucide-react";
import { inArray } from "drizzle-orm";
import { appUser, auditLog, db, type AuditEntry } from "@/lib/db";
import { listAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/authz";
import { listSshSessions, type SshSession } from "@/lib/ssh-sessions";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  CardRow,
  CardRowField,
  CardRowMeta,
  CardRows,
  Table,
  TableBody,
  TableDesktop,
  TableHead,
  Td,
  Th,
  Tr,
} from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { AuditDetail } from "./audit-detail";
import { AuditFilters, type AuditFacets } from "./audit-filters";
import { humanizeAction, isoTimestamp, relativeTime, targetHref } from "./format";

// The audit trail is live local state read at request time; never prerender it.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
/** The SSH sessions card is a glance, not a full paginated trail - see
 *  {@link SshSessionsCard}. */
const SSH_SESSIONS_LIMIT = 20;

/** Filters lifted out of the URL searchParams. */
interface ActiveFilters {
  action?: string;
  targetType?: string;
  actor?: string;
}

interface AuditView {
  entries: AuditEntry[];
  total: number;
  facets: RawFacets;
}

/**
 * Distinct facet values straight from the log, before actor ids are resolved to
 * names. `actorIds` are stable ids ("operator" or an `app_user.id`); the page
 * joins them to current display names once, for both the filter rail and the rows.
 */
interface RawFacets {
  actions: string[];
  targetTypes: string[];
  actorIds: string[];
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

  // Gated the same as the trail above (owner/admin/operator, not viewer) and
  // read independently: a hiccup reading `ssh_session` shouldn't take down
  // the rest of the page, so its failure is tracked separately from `error`.
  const canViewSshSessions = await sessionCan("audit.read");
  let sshSessions: SshSession[] = [];
  let sshSessionsFailed = false;
  if (canViewSshSessions) {
    try {
      const page = await listSshSessions({ limit: SSH_SESSIONS_LIMIT });
      sshSessions = page.entries;
    } catch {
      sshSessionsFailed = true;
    }
  }

  const entries = view?.entries ?? [];
  const total = view?.total ?? 0;
  const rawFacets: RawFacets = view?.facets ?? {
    actions: [],
    targetTypes: [],
    actorIds: [],
  };

  // Resolve every stable actor id we're about to show - the filter rail, the
  // trail rows, and the SSH card - to a current display name in one join. This
  // is what collapses a person to a single actor (their id) with their whole
  // history, and keeps the name fresh after an IdP rename. Best-effort: on a
  // read failure the ids simply render verbatim (see resolveActorNames).
  const actorNames = await resolveActorNames([
    ...rawFacets.actorIds,
    ...entries.map((entry) => entry.actor),
    ...sshSessions.map((entry) => entry.actor),
  ]);

  const facets: AuditFacets = {
    actions: rawFacets.actions,
    targetTypes: rawFacets.targetTypes,
    // Pre-resolve actor ids to labels here (the client filter can't join
    // `app_user`), keeping the stable id as the option value so filtering still
    // matches on it. Sort by the visible name.
    actors: rawFacets.actorIds
      .map((value) => ({ value, label: actorName(value, actorNames) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };

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
          title="No operator activity recorded yet"
          description="Actions appear here as operators make changes."
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
                <TableDesktop>
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
                        <AuditRow key={entry.id} entry={entry} actorNames={actorNames} />
                      ))}
                    </TableBody>
                  </Table>
                </TableDesktop>

                {/* Below `md`, the columns above give way to one entry per
                    card instead of a table that scrolls the detail column
                    off-screen. */}
                <CardRows>
                  {entries.map((entry) => (
                    <AuditCard key={entry.id} entry={entry} actorNames={actorNames} />
                  ))}
                </CardRows>
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

      {canViewSshSessions && (
        <SshSessionsCard
          sessions={sshSessions}
          failed={sshSessionsFailed}
          actorNames={actorNames}
        />
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

/**
 * Distinct values for each filterable column. Actions and target types come out
 * pre-sorted; actor ids are returned raw (a mix of `app_user.id`, "operator",
 * and legacy name-based values) and sorted by resolved name once named upstream.
 */
async function loadFacets(): Promise<RawFacets> {
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
    actorIds: nonEmpty(actors.map((row) => row.value)),
  };
}

/**
 * Resolve stable actor ids to current display names for render. The trail stores
 * a stable actor id per row (an `app_user.id`, or "operator" in single-operator
 * mode); we join those against `app_user` here so each person shows under one
 * identity with their up-to-date name - even after an IdP-driven rename.
 *
 * Best-effort and backward-tolerant: a read failure yields an empty map (ids
 * render verbatim), and legacy rows that stored a raw name - or any id with no
 * matching account - simply fall back to the stored value (see {@link actorName}).
 */
async function resolveActorNames(actorIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(actorIds.filter((id) => id && id.trim())));
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  try {
    const rows = await db
      .select({ id: appUser.id, name: appUser.name })
      .from(appUser)
      .where(inArray(appUser.id, ids));
    for (const row of rows) names.set(row.id, row.name);
  } catch {
    // Leave the map empty; callers fall back to the raw actor id.
  }
  return names;
}

/**
 * The display name for a stored actor id: the resolved account name, the friendly
 * "Operator" for single-operator mode, or the raw value verbatim for a legacy
 * name-based row or an id whose account no longer exists.
 */
function actorName(actor: string, names: Map<string, string>): string {
  if (actor === "operator") return "Operator";
  return names.get(actor) ?? actor;
}

function AuditRow({
  entry,
  actorNames,
}: {
  entry: AuditEntry;
  actorNames: Map<string, string>;
}) {
  const tsDate = entry.ts instanceof Date ? entry.ts : new Date(entry.ts);

  return (
    <Tr>
      <Td data className="whitespace-nowrap text-ink-muted" title={isoTimestamp(tsDate)}>
        {relativeTime(tsDate)}
      </Td>
      <Td>
        {/* title carries the stable actor id behind the resolved name. */}
        <span className="data text-ink-muted" title={entry.actor}>
          {actorName(entry.actor, actorNames)}
        </span>
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
        <AuditDetail detail={entry.detail} className="max-w-[28rem]" />
      </Td>
    </Tr>
  );
}

/**
 * Small-screen counterpart to `AuditRow`: the same time, actor, action,
 * target, and detail readouts, stacked into one card - the action headline
 * takes the identity slot the other list cards give their primary column,
 * with the relative time pinned opposite it.
 */
function AuditCard({
  entry,
  actorNames,
}: {
  entry: AuditEntry;
  actorNames: Map<string, string>;
}) {
  const tsDate = entry.ts instanceof Date ? entry.ts : new Date(entry.ts);

  return (
    <CardRow>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="font-medium text-ink">{humanizeAction(entry.action)}</span>
            <span className="data text-xs text-ink-faint">{entry.action}</span>
          </span>
          <span
            className="data shrink-0 whitespace-nowrap text-xs text-ink-muted"
            title={isoTimestamp(tsDate)}
          >
            {relativeTime(tsDate)}
          </span>
        </div>
        <CardRowMeta>
          <CardRowField label="Actor">
            {/* title carries the stable actor id behind the resolved name. */}
            <span className="data" title={entry.actor}>
              {actorName(entry.actor, actorNames)}
            </span>
          </CardRowField>
          <CardRowField label="Target">
            <TargetCell entry={entry} />
          </CardRowField>
          <CardRowField label="Detail" className="col-span-2">
            <AuditDetail detail={entry.detail} />
          </CardRowField>
        </CardRowMeta>
      </div>
    </CardRow>
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

/**
 * A small, unfiltered "who connected to what, when" readout for the browser
 * SSH terminal (see `@/lib/ssh-sessions`) - deliberately separate from the
 * audit trail above rather than merged into its filters/pagination, since it
 * reads a differently-shaped table (no `action`/`targetType` to facet on).
 * Start-only: there's no end time or duration to show, by design (see that
 * module's doc comment) - this is metadata, not a keystroke transcript.
 */
function SshSessionsCard({
  sessions,
  failed,
  actorNames,
}: {
  sessions: SshSession[];
  failed: boolean;
  actorNames: Map<string, string>;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-0.5">
          <CardTitle>Recent SSH sessions</CardTitle>
          <p className="text-xs text-ink-muted">
            Browser terminal connections - who, which device, which SSH user, when. Not a
            transcript, and there&apos;s no observed end time or duration.
          </p>
        </div>
        {!failed && (
          <Chip mono variant="default">
            {sessions.length}
          </Chip>
        )}
      </CardHeader>
      {failed ? (
        <CardBody>
          <p className="text-center text-xs text-ink-muted">
            Couldn&apos;t read recent SSH sessions. The local store may be unavailable.
          </p>
        </CardBody>
      ) : sessions.length === 0 ? (
        <CardBody>
          <p className="text-center text-xs text-ink-muted">
            No SSH terminal sessions recorded yet.
          </p>
        </CardBody>
      ) : (
        <Table>
          <TableHead>
            <Tr className="hover:bg-transparent">
              <Th>Time</Th>
              <Th>Actor</Th>
              <Th>Device</Th>
              <Th>SSH user</Th>
            </Tr>
          </TableHead>
          <TableBody>
            {sessions.map((entry) => (
              <SshSessionRow key={entry.id} entry={entry} actorNames={actorNames} />
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function SshSessionRow({
  entry,
  actorNames,
}: {
  entry: SshSession;
  actorNames: Map<string, string>;
}) {
  const startedAt = entry.startedAt instanceof Date ? entry.startedAt : new Date(entry.startedAt);

  return (
    <Tr>
      <Td data className="whitespace-nowrap text-ink-muted" title={isoTimestamp(startedAt)}>
        {relativeTime(startedAt)}
      </Td>
      <Td>
        {/* Resolved like the audit rows; title carries the stable actor id. */}
        <span className="data text-ink-muted" title={entry.actor}>
          {actorName(entry.actor, actorNames)}
        </span>
      </Td>
      <Td>
        <span className="inline-flex items-baseline gap-1">
          <SquareTerminal className="h-3 w-3 shrink-0 self-center text-ink-faint" aria-hidden />
          <span className="data text-ink">{entry.deviceName}</span>
        </span>
      </Td>
      <Td>
        <span className="data text-ink-muted">{entry.sshUser}</span>
      </Td>
    </Tr>
  );
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
