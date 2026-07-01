/**
 * Filter the Headtower agent's own tailnet node out of listings (server-only).
 *
 * The bundled agent sidecar joins the tailnet itself, under the hostname in
 * `HEADTOWER_AGENT_HOSTNAME` (default `"headtower-agent"`, the deployed
 * default), so it can resolve peers for machine enrichment. Headscale may
 * append a numeric dedupe suffix if that hostname collides (`"-3"`). That node
 * is infrastructure, not an operator's device, so it should never appear in the
 * console - every node list/count reads through {@link withoutAgentNodes}
 * immediately after `nodes.list()`.
 *
 * SERVER-ONLY: reads `process.env`. Import from Server Components / loaders,
 * never from a client component.
 */

import type { Node } from "@/lib/headscale";

/** The agent's hostname when the operator hasn't overridden it. */
const DEFAULT_AGENT_HOSTNAME = "headtower-agent";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The configured agent hostname, falling back to the deployed default. */
function agentHostname(): string {
  return process.env.HEADTOWER_AGENT_HOSTNAME?.trim() || DEFAULT_AGENT_HOSTNAME;
}

/**
 * True when `node` is the agent sidecar's own tailnet node: its `givenName` or
 * `name` matches the configured hostname, optionally followed by a Headscale
 * dedupe suffix (e.g. `"headtower-agent-3"`).
 */
export function isAgentNode(node: Pick<Node, "name" | "givenName">): boolean {
  const pattern = new RegExp(`^${escapeRegExp(agentHostname())}(-\\d+)?$`);
  return pattern.test(node.givenName) || pattern.test(node.name);
}

/** `nodes`, with the agent's own node (if present) filtered out. */
export function withoutAgentNodes<T extends Pick<Node, "name" | "givenName">>(
  nodes: T[],
): T[] {
  return nodes.filter((node) => !isAgentNode(node));
}
