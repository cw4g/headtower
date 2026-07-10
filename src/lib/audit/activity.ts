/**
 * Audit action presentation - a typed leading icon and a humanized one-line
 * label per action key, for compact activity feeds (the dashboard's
 * `RecentActivity`). Pure and framework-agnostic (no `@/lib/db` import), unlike
 * `@/lib/audit` itself, so it's safe to pull into a component tree that must
 * stay free of the `node:sqlite` import.
 *
 * Kept in sync with the action keys `recordAudit({ action: "..." })` writes
 * across the app's Server Actions - see `@/lib/audit`'s doc comment for the
 * `area.verb` convention. Unlisted keys still render sensibly via a generic
 * fallback, so a new action key never shows up blank.
 *
 *   activityIcon("node.rename")   -> PencilLine
 *   activityLabel("node.rename")  -> "Node renamed"
 */
import {
  Ban,
  Check,
  Cpu,
  Database,
  History,
  KeyRound,
  KeySquare,
  LaptopMinimal,
  LogIn,
  LogOut,
  NotebookPen,
  PencilLine,
  PlugZap,
  RotateCcw,
  Save,
  ShieldCheck,
  SquareTerminal,
  Tags,
  Trash2,
  UserCog,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react";

interface ActionMeta {
  icon: LucideIcon;
  label: string;
}

/** Known action keys, icon-matched to the same glyph used for that operation
 *  elsewhere in the console (node actions, routes board, policy workbench, ...)
 *  so the feed reads as one consistent icon language rather than its own. */
const ACTION_META: Record<string, ActionMeta> = {
  "node.register": { icon: LaptopMinimal, label: "Node registered" },
  "node.rename": { icon: PencilLine, label: "Node renamed" },
  "node.expire": { icon: Ban, label: "Node expired" },
  "node.bulkExpire": { icon: Ban, label: "Nodes expired" },
  "node.delete": { icon: Trash2, label: "Node deleted" },
  "node.bulkDelete": { icon: Trash2, label: "Nodes deleted" },
  "node.setTags": { icon: Tags, label: "Node tags changed" },
  "node.bulkSetTags": { icon: Tags, label: "Node tags changed" },
  "node.moveUser": { icon: UserCog, label: "Node owner changed" },
  "node.metadata.set": { icon: NotebookPen, label: "Node notes updated" },
  "node.metadata.clear": { icon: NotebookPen, label: "Node notes cleared" },

  "routes.approve": { icon: Check, label: "Route approved" },
  "routes.revoke": { icon: RotateCcw, label: "Route revoked" },

  "acl.save": { icon: Save, label: "Policy saved" },

  "apikey.create": { icon: KeySquare, label: "API key created" },
  "apikey.expire": { icon: Ban, label: "API key expired" },
  "apikey.delete": { icon: Trash2, label: "API key deleted" },

  "preauthkey.create": { icon: KeyRound, label: "Pre-auth key created" },
  "preauthkey.expire": { icon: Ban, label: "Pre-auth key expired" },
  "preauthkey.delete": { icon: Trash2, label: "Pre-auth key deleted" },

  "personal_key.create": { icon: KeyRound, label: "Personal key created" },
  "personal_key.revoke": { icon: Ban, label: "Personal key revoked" },

  "user.create": { icon: UserRoundPlus, label: "User created" },
  "user.rename": { icon: PencilLine, label: "User renamed" },
  "user.delete": { icon: Trash2, label: "User removed" },

  "member.remove": { icon: Trash2, label: "Member removed" },
  "member.role_change": { icon: UserCog, label: "Member role changed" },

  "auth.login": { icon: LogIn, label: "Signed in" },
  "auth.logout": { icon: LogOut, label: "Signed out" },
  "session.revoke": { icon: LogOut, label: "Session revoked" },
  "session.revoke_others": { icon: LogOut, label: "Other sessions revoked" },

  "ssh.connect": { icon: SquareTerminal, label: "SSH session started" },

  "config.setup": { icon: PlugZap, label: "Initial setup completed" },
  "config.connection": { icon: PlugZap, label: "Connection settings updated" },
  "config.authentication": { icon: ShieldCheck, label: "Authentication settings updated" },
  "config.agent": { icon: Cpu, label: "Agent settings updated" },
  "config.database_export": { icon: Database, label: "Database exported" },
  "config.oidc_provider.create": { icon: KeyRound, label: "Identity provider added" },
  "config.oidc_provider.update": { icon: KeyRound, label: "Identity provider updated" },
  "config.oidc_provider.delete": { icon: KeyRound, label: "Identity provider removed" },
};

/** Typed leading icon for an action key. Falls back to a generic activity
 *  glyph for anything not in {@link ACTION_META}, so a not-yet-mapped action
 *  never renders iconless. */
export function activityIcon(action: string): LucideIcon {
  return ACTION_META[action]?.icon ?? History;
}

/**
 * Humanized one-line label for an action key ("node.rename" -> "Node
 * renamed"). Unmapped keys fall back to a tidy "Subject verb" reading of the
 * raw `area.verb` key, so a new action key never shows up as raw dot/camel
 * case before this map is updated for it.
 */
export function activityLabel(action: string): string {
  return ACTION_META[action]?.label ?? fallbackLabel(action);
}

function fallbackLabel(action: string): string {
  const key = action.trim();
  if (!key) return "Activity";

  const parts = key.split(".");
  const verb = parts[parts.length - 1] ?? key;
  const subject = parts.slice(0, -1).join(" ").replace(/_/g, " ");
  const verbWords = verb.replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2");

  return subject ? `${titleCase(subject)} ${verbWords.toLowerCase()}` : titleCase(verbWords);
}

function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
