/**
 * Headtower's Headscale REST client - public surface.
 *
 * SERVER-ONLY. Import resource objects from here (or the individual modules) in
 * Server Components and Server Actions; never from client components.
 *
 *   import { nodes, users, preAuthKeys, apiKeys, routes, policy } from "@/lib/headscale";
 *
 * See ./client for the request core and the full endpoint map.
 */

export {
  HeadscaleError,
  HeadscaleConfigError,
  HeadscaleTimeoutError,
  HeadscaleNetworkError,
  HeadscaleRequestError,
  HeadscaleParseError,
  request,
  type RequestOptions,
} from "./client";

export type {
  Timestamp,
  HeadscaleId,
  RegisterMethod,
  User,
  PreAuthKey,
  Node,
  ApiKey,
  Policy,
} from "./types";

export { nodes } from "./nodes";
export { users, type CreateUserInput, type ListUsersFilter } from "./users";
export {
  preAuthKeys,
  type CreatePreAuthKeyInput,
  type ExpirePreAuthKeyInput,
} from "./pre-auth-keys";
export { apiKeys } from "./api-keys";
export { routes, type NodeRoutes } from "./routes";
export { policy } from "./policy";
export {
  dns,
  type DNSConfig,
  type DNSExtraRecord,
  type DNSSplitResolvers,
} from "./dns";
