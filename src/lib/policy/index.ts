/**
 * Pure, isomorphic policy helpers - parse, serialize, and round-trip the
 * Headscale HuJSON ACL document. No server imports; safe in client components.
 *
 *   import { parsePolicy, serializePolicy, validateHujson } from "@/lib/policy";
 */

export {
  stripHujson,
  parseHujson,
  validateHujson,
  cleanParseMessage,
  type Validity,
} from "./hujson";

export {
  parsePolicy,
  serializePolicy,
  roundTripPolicy,
  emptyModel,
  type PolicyModel,
  type ParsedPolicy,
  type AclRule,
  type SshRule,
  type NamedList,
  type HostEntry,
  type AutoApprovers,
} from "./model";

export {
  lintPolicy,
  type LintFinding,
  type LintSeverity,
  type LintOptions,
} from "./lint";

export {
  evaluateReachability,
  type EvalQuery,
  type EvalResult,
  type EvalMatch,
} from "./eval";
