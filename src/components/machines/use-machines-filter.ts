"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  matchesQuery,
  matchesStatus,
  type NodeView,
  type StatusFilter,
} from "@/lib/machines";
import {
  ENVIRONMENTS,
  normalizeEnvironment,
  type NodeEnvironment,
  type NodeMetadataValue,
} from "@/lib/db/node-metadata-types";

/** The five filter dimensions, all mirrored in the URL searchParams. */
export interface MachinesFilterState {
  /** Free-text query across names, owner, addresses, tags, and metadata. */
  query: string;
  /** Status segment (all | online | offline | issues). */
  status: StatusFilter;
  /** Owner handle to scope to, from `?user=` deep-links. */
  user: string | null;
  /** Tag to scope to, from `?tag=` deep-links (with or without `tag:`). */
  tag: string | null;
  /** Deployment environment to scope to, from `?env=`; `null` is "any". */
  env: NodeEnvironment | null;
}

export interface MachinesFilter {
  /** Nodes passing every active filter, in the input order. */
  filtered: NodeView[];
  /** Total nodes before filtering. */
  total: number;
  /** Online (non-expired) count across the full set, for the toolbar readout. */
  onlineCount: number;
  state: MachinesFilterState;
  /** The environments actually present in the set, in ENVIRONMENTS order. */
  environments: NodeEnvironment[];
  /** True when any filter is narrowing the list (drives the clear affordance). */
  active: boolean;
  setQuery: (query: string) => void;
  setStatus: (status: StatusFilter) => void;
  /** Drop (or set) the `?user=` owner scope; `null` clears it. */
  setUser: (user: string | null) => void;
  /** Drop (or set) the `?tag=` scope; `null` clears it. */
  setTag: (tag: string | null) => void;
  /** Drop (or set) the `?env=` environment scope; `null` clears it. */
  setEnv: (env: NodeEnvironment | null) => void;
  clear: () => void;
}

const STATUS_VALUES: StatusFilter[] = ["all", "online", "offline", "issues"];

/** Narrow an untrusted `?status=` value to a known segment. */
function narrowStatus(value: string | null): StatusFilter {
  return value && (STATUS_VALUES as string[]).includes(value)
    ? (value as StatusFilter)
    : "all";
}

/** Narrow an untrusted `?env=` value to a known environment (else "any"). */
function narrowEnv(value: string | null): NodeEnvironment | null {
  return value ? normalizeEnvironment(value) : null;
}

/** Owner match: case-insensitive against handle, display name, or email. */
function matchesUser(node: NodeView, user: string | null): boolean {
  if (!user) return true;
  const wanted = user.toLowerCase();
  return (
    node.user.name.toLowerCase() === wanted ||
    node.user.displayName.toLowerCase() === wanted ||
    node.user.email.toLowerCase() === wanted
  );
}

/** Tag match: accepts the param with or without the `tag:` prefix. */
function matchesTag(node: NodeView, tag: string | null): boolean {
  if (!tag) return true;
  const bare = tag.replace(/^tag:/, "").toLowerCase();
  return node.tags.some((t) => t.replace(/^tag:/, "").toLowerCase() === bare);
}

/** Environment match against the node's Headtower-local metadata. */
function matchesEnv(
  meta: NodeMetadataValue | undefined,
  env: NodeEnvironment | null,
): boolean {
  if (!env) return true;
  return (meta?.environment ?? null) === env;
}

/** Whether two filter states carry the same values. */
function sameFilters(a: MachinesFilterState, b: MachinesFilterState): boolean {
  return (
    a.query === b.query &&
    a.status === b.status &&
    a.user === b.user &&
    a.tag === b.tag &&
    a.env === b.env
  );
}

/**
 * URL-backed machines filter, shared verbatim by the table and card views.
 *
 * The filter lives in the URL searchParams (`q`, `status`, `user`, `tag`) so it
 * survives a view toggle (which remounts the list leaf) and back/forward nav,
 * and so dashboard tiles and the users page can deep-link a slice
 * (`/machines?user=alice`). Local state is the render source for instant,
 * per-keystroke filtering off the already-loaded `nodes`; it mirrors into the
 * URL with `router.replace` (no history spam), debounced for the text query so
 * typing doesn't churn the force-dynamic page. External URL changes (deep-link,
 * back/forward) re-seed the local state, while our own writes are ignored via a
 * written-value ref so fast typing is never clobbered by a stale round trip.
 */
export function useMachinesFilter(
  nodes: NodeView[],
  metadata: Record<string, NodeMetadataValue> = {},
): MachinesFilter {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const url = React.useMemo<MachinesFilterState>(
    () => ({
      query: searchParams.get("q") ?? "",
      status: narrowStatus(searchParams.get("status")),
      user: searchParams.get("user"),
      tag: searchParams.get("tag"),
      env: narrowEnv(searchParams.get("env")),
    }),
    [searchParams],
  );

  const [state, setState] = React.useState<MachinesFilterState>(url);
  // The last state we pushed to the URL, so we can tell our own writes from an
  // external navigation and avoid a reseed→rewrite loop.
  const writtenRef = React.useRef<MachinesFilterState>(url);

  // Re-seed from the URL on external changes only.
  React.useEffect(() => {
    if (sameFilters(url, writtenRef.current)) return;
    writtenRef.current = url;
    setState(url);
  }, [url]);

  // Mirror local state into the URL; debounce only the free-text query.
  React.useEffect(() => {
    if (sameFilters(state, url)) return;
    const commit = () => {
      writtenRef.current = state;
      const params = new URLSearchParams();
      if (state.query) params.set("q", state.query);
      if (state.status !== "all") params.set("status", state.status);
      if (state.user) params.set("user", state.user);
      if (state.tag) params.set("tag", state.tag);
      if (state.env) params.set("env", state.env);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };
    if (state.query !== url.query) {
      const id = setTimeout(commit, 250);
      return () => clearTimeout(id);
    }
    commit();
  }, [state, url, pathname, router]);

  const filtered = React.useMemo(
    () =>
      nodes.filter(
        (node) =>
          matchesStatus(node, state.status) &&
          matchesQuery(node, state.query, metadata[node.id]) &&
          matchesUser(node, state.user) &&
          matchesTag(node, state.tag) &&
          matchesEnv(metadata[node.id], state.env),
      ),
    [nodes, state, metadata],
  );

  const onlineCount = React.useMemo(
    () => nodes.filter((n) => n.online && !n.expired).length,
    [nodes],
  );

  // The environments actually present across the set, in ENVIRONMENTS order, so
  // the toolbar only offers a scope the operator can act on.
  const environments = React.useMemo(() => {
    const present = new Set<NodeEnvironment>();
    for (const node of nodes) {
      const env = metadata[node.id]?.environment;
      if (env) present.add(env);
    }
    return ENVIRONMENTS.filter((e) => present.has(e.value)).map((e) => e.value);
  }, [nodes, metadata]);

  const setQuery = React.useCallback(
    (query: string) => setState((s) => ({ ...s, query })),
    [],
  );
  const setStatus = React.useCallback(
    (status: StatusFilter) => setState((s) => ({ ...s, status })),
    [],
  );
  const setUser = React.useCallback(
    (user: string | null) => setState((s) => ({ ...s, user })),
    [],
  );
  const setTag = React.useCallback(
    (tag: string | null) => setState((s) => ({ ...s, tag })),
    [],
  );
  const setEnv = React.useCallback(
    (env: NodeEnvironment | null) => setState((s) => ({ ...s, env })),
    [],
  );
  const clear = React.useCallback(
    () =>
      setState({ query: "", status: "all", user: null, tag: null, env: null }),
    [],
  );

  const active = Boolean(
    state.query ||
      state.status !== "all" ||
      state.user ||
      state.tag ||
      state.env,
  );

  return {
    filtered,
    total: nodes.length,
    onlineCount,
    state,
    environments,
    active,
    setQuery,
    setStatus,
    setUser,
    setTag,
    setEnv,
    clear,
  };
}
