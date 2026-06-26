/**
 * Headtower role-based access control (server-only).
 *
 * A tiny, static capability model: every operator account (`app_user.role`)
 * holds one {@link Role}, each role grants a fixed set of {@link Capability}
 * strings, and {@link can} answers "may this role do this?". Capabilities are
 * named `<area>.<read|write>` so call sites read naturally:
 *
 *   if (!can(user.role, "machines.write")) throw new ForbiddenError();
 *
 * Roles (most to least privileged):
 *   owner     everything, including assigning roles to other accounts
 *   admin     everything except member/role management
 *   operator  read everything + day-to-day ops (devices, route approval, keys);
 *             the DEFAULT role assigned to new accounts
 *   viewer    read-only across resources
 *
 * SERVER-ONLY: gate UI on capabilities behind a server boundary, not by shipping
 * this map to the browser. Importing it client-side throws.
 *
 * Exposed surface:
 *   types     Role, Capability
 *   data      ROLES, CAPABILITIES, ROLE_LABELS, DEFAULT_ROLE
 *   helpers   can(role, capability), capabilitiesFor(role), isRole(value)
 */

if (typeof window !== "undefined") {
  throw new Error(
    "@/lib/rbac is server-only and must not be imported into client components. " +
      "Resolve capabilities on the server and pass plain booleans to the client.",
  );
}

/** Every role Headtower understands, most privileged first. */
export const ROLES = ["owner", "admin", "operator", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/** The role new accounts receive until an owner promotes them. */
export const DEFAULT_ROLE: Role = "operator";

/** Short human labels for the console. */
export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  operator: "Operator",
  viewer: "Viewer",
};

/** Every capability that can be granted, grouped `<area>.<read|write>`. */
export const CAPABILITIES = [
  "machines.read",
  "machines.write",
  "users.read",
  "users.write",
  "routes.read",
  "routes.write",
  "acls.read",
  "acls.write",
  "dns.read",
  "dns.write",
  "keys.read",
  "keys.write",
  "settings.read",
  "settings.write",
  "audit.read",
  "members.manage",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** The read half of every resource area; the shared baseline for all roles. */
const READ_ONLY: readonly Capability[] = [
  "machines.read",
  "users.read",
  "routes.read",
  "acls.read",
  "dns.read",
  "keys.read",
  "settings.read",
];

/** Role -> granted capabilities. Sets give O(1) membership checks. */
const CAPABILITY_MAP: Record<Role, ReadonlySet<Capability>> = {
  owner: new Set<Capability>(CAPABILITIES),
  admin: new Set<Capability>(CAPABILITIES.filter((c) => c !== "members.manage")),
  operator: new Set<Capability>([
    ...READ_ONLY,
    "audit.read",
    "machines.write",
    "routes.write",
    "keys.write",
  ]),
  viewer: new Set<Capability>(READ_ONLY),
};

/** True when `role` is allowed to perform `capability`. */
export function can(role: Role, capability: Capability): boolean {
  return CAPABILITY_MAP[role].has(capability);
}

/** The full capability list for a role (stable order, for display/debugging). */
export function capabilitiesFor(role: Role): Capability[] {
  return CAPABILITIES.filter((capability) => CAPABILITY_MAP[role].has(capability));
}

/** Type guard for untrusted input (e.g. a role string read from the database). */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
