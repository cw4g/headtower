"use client";

import * as React from "react";
import {
  DoorOpen,
  KeyRound,
  Network,
  Plus,
  Route,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  SquareTerminal,
  Tag as TagIcon,
  Trash2,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Field, Input, Select } from "@/components/ui/field";
import { TokenInput } from "@/components/ui/token-input";
import { cn } from "@/lib/cn";
import type {
  AclRule,
  GrantEntry,
  HostEntry,
  NamedList,
  NodeAttrEntry,
  PolicyModel,
  SshRule,
} from "@/lib/policy";

/**
 * Node attributes Headscale's policy reference documents, offered as completions.
 * Deliberately suggestions and not validation: that reference says "At least the
 * following node attributes are currently supported", so the set is open and
 * rejecting an unlisted value would be wrong.
 */
const ATTR_SUGGESTIONS = [
  "drive:share",
  "drive:access",
  "magicdns-aaaa",
  "disable-ipv4",
  "randomize-client-port",
  "disable-captive-portal-detection",
  "nextdns:no-device-info",
];

interface VisualEditorProps {
  model: PolicyModel;
  onChange: (next: PolicyModel) => void;
}

/** Every `autogroup:*` token already referenced anywhere in the model, deduped. */
function collectAutogroups(model: PolicyModel): string[] {
  const found = new Set<string>();
  const scan = (values: string[]) => {
    for (const value of values) {
      if (value.startsWith("autogroup:")) found.add(value);
    }
  };
  for (const rule of model.acls) {
    scan(rule.src);
    scan(rule.dst);
  }
  for (const rule of model.ssh) {
    scan(rule.src);
    scan(rule.dst);
    scan(rule.users);
  }
  for (const grant of model.grants) {
    scan(grant.src);
    scan(grant.dst);
  }
  // A Taildrive policy names autogroup:member only here, so miss this and the
  // completions would not offer a token the document already uses.
  for (const entry of model.nodeAttrs) scan(entry.target);
  for (const group of model.groups) scan(group.values);
  for (const tag of model.tagOwners) scan(tag.values);
  for (const route of model.autoApprovers.routes) scan(route.values);
  scan(model.autoApprovers.exitNode);
  return [...found];
}

/**
 * The visual policy builder: each standard HuJSON section rendered as an
 * editable, schematic panel. Every edit produces a fresh model that the
 * workbench serializes straight back to the document, so the JSON tab and the
 * stored policy stay in lockstep. Only the known sections are touched; unknown
 * keys and fields ride along untouched on the model's `root` / rule `raw`.
 */
export function VisualEditor({ model, onChange }: VisualEditorProps) {
  // --- Autocomplete suggestions, fed from the model's own definitions ------
  const groupNames = React.useMemo(
    () => model.groups.map((g) => g.name).filter(Boolean),
    [model.groups],
  );
  const tagNames = React.useMemo(
    () => model.tagOwners.map((t) => t.name).filter(Boolean),
    [model.tagOwners],
  );
  const hostNames = React.useMemo(
    () => model.hosts.map((h) => h.name).filter(Boolean),
    [model.hosts],
  );
  const autogroups = React.useMemo(() => collectAutogroups(model), [model]);
  // src/dst: any reference a rule can name - hosts, groups, tags, the wildcard,
  // plus whichever autogroup: forms are already in use.
  const srcDstSuggestions = React.useMemo(
    () => [...hostNames, ...groupNames, ...tagNames, "*", ...autogroups],
    [hostNames, groupNames, tagNames, autogroups],
  );
  // Group-ref fields (SSH users, tag owners): groups plus autogroup: forms.
  const groupRefSuggestions = React.useMemo(
    () => [...groupNames, ...autogroups],
    [groupNames, autogroups],
  );
  // --- Access rules (acls) -------------------------------------------------
  const setAcls = (acls: AclRule[]) => onChange({ ...model, acls });
  const addAcl = () =>
    setAcls([...model.acls, { action: "accept", src: [], dst: [] }]);
  const patchAcl = (i: number, patch: Partial<AclRule>) =>
    setAcls(model.acls.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeAcl = (i: number) =>
    setAcls(model.acls.filter((_, idx) => idx !== i));

  // --- Grants --------------------------------------------------------------
  const setGrants = (grants: GrantEntry[]) => onChange({ ...model, grants });
  const addGrant = () =>
    setGrants([...model.grants, { src: [], dst: [], ip: [], via: [] }]);
  const patchGrant = (i: number, patch: Partial<GrantEntry>) =>
    setGrants(model.grants.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  const removeGrant = (i: number) =>
    setGrants(model.grants.filter((_, idx) => idx !== i));

  // --- Node attributes -----------------------------------------------------
  const setNodeAttrs = (nodeAttrs: NodeAttrEntry[]) =>
    onChange({ ...model, nodeAttrs });
  const addNodeAttr = () =>
    setNodeAttrs([...model.nodeAttrs, { target: [], attr: [] }]);
  const patchNodeAttr = (i: number, patch: Partial<NodeAttrEntry>) =>
    setNodeAttrs(
      model.nodeAttrs.map((e, idx) => (idx === i ? { ...e, ...patch } : e)),
    );
  const removeNodeAttr = (i: number) =>
    setNodeAttrs(model.nodeAttrs.filter((_, idx) => idx !== i));

  // --- SSH rules (ssh) -----------------------------------------------------
  const setSsh = (ssh: SshRule[]) => onChange({ ...model, ssh });
  const addSsh = () =>
    setSsh([
      ...model.ssh,
      { action: "accept", src: [], dst: [], users: [] },
    ]);
  const patchSsh = (i: number, patch: Partial<SshRule>) =>
    setSsh(model.ssh.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeSsh = (i: number) =>
    setSsh(model.ssh.filter((_, idx) => idx !== i));

  // --- Groups --------------------------------------------------------------
  const setGroups = (groups: NamedList[]) => onChange({ ...model, groups });
  const addGroup = () =>
    setGroups([...model.groups, { name: "group:", values: [] }]);
  const patchGroup = (i: number, patch: Partial<NamedList>) =>
    setGroups(model.groups.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  const removeGroup = (i: number) =>
    setGroups(model.groups.filter((_, idx) => idx !== i));

  // --- Tag owners ----------------------------------------------------------
  const setTagOwners = (tagOwners: NamedList[]) =>
    onChange({ ...model, tagOwners });
  const addTagOwner = () =>
    setTagOwners([...model.tagOwners, { name: "tag:", values: [] }]);
  const patchTagOwner = (i: number, patch: Partial<NamedList>) =>
    setTagOwners(
      model.tagOwners.map((t, idx) => (idx === i ? { ...t, ...patch } : t)),
    );
  const removeTagOwner = (i: number) =>
    setTagOwners(model.tagOwners.filter((_, idx) => idx !== i));

  // --- Hosts ---------------------------------------------------------------
  const setHosts = (hosts: HostEntry[]) => onChange({ ...model, hosts });
  const addHost = () => setHosts([...model.hosts, { name: "", cidr: "" }]);
  const patchHost = (i: number, patch: Partial<HostEntry>) =>
    setHosts(model.hosts.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));
  const removeHost = (i: number) =>
    setHosts(model.hosts.filter((_, idx) => idx !== i));

  // --- Auto-approvers ------------------------------------------------------
  const setRoutes = (routes: NamedList[]) =>
    onChange({ ...model, autoApprovers: { ...model.autoApprovers, routes } });
  const addRoute = () =>
    setRoutes([...model.autoApprovers.routes, { name: "", values: [] }]);
  const patchRoute = (i: number, patch: Partial<NamedList>) =>
    setRoutes(
      model.autoApprovers.routes.map((r, idx) =>
        idx === i ? { ...r, ...patch } : r,
      ),
    );
  const removeRoute = (i: number) =>
    setRoutes(model.autoApprovers.routes.filter((_, idx) => idx !== i));
  const setExitNode = (exitNode: string[]) =>
    onChange({ ...model, autoApprovers: { ...model.autoApprovers, exitNode } });

  return (
    <div className="space-y-4">
      <GroupLabel>Access policy</GroupLabel>

      {/* Access rules ------------------------------------------------------ */}
      <SectionCard
        icon={Network}
        title="Access rules"
        hint="Allow a set of sources to reach a set of destinations."
        count={model.acls.length}
        addLabel="Add rule"
        onAdd={addAcl}
        emptyText="No access rules. Every node is isolated until a rule grants reach."
      >
        {model.acls.map((rule, i) => (
          <RuleShell
            key={i}
            label={`rule ${i + 1}`}
            onRemove={() => removeAcl(i)}
            header={
              <Chip mono variant="default">
                accept
              </Chip>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Source">
                <TokenInput
                  ariaLabel={`Access rule ${i + 1} sources`}
                  values={rule.src}
                  onChange={(src) => patchAcl(i, { src })}
                  placeholder="group:eng, tag:ci, 100.64.0.0/10"
                  suggestions={srcDstSuggestions}
                />
              </Field>
              <Field label="Destination">
                <TokenInput
                  ariaLabel={`Access rule ${i + 1} destinations`}
                  values={rule.dst}
                  onChange={(dst) => patchAcl(i, { dst })}
                  placeholder="tag:prod:22,443, *:*"
                  suggestions={srcDstSuggestions}
                />
              </Field>
            </div>
          </RuleShell>
        ))}
      </SectionCard>

      {/* Grants ------------------------------------------------------------ */}
      <SectionCard
        icon={KeyRound}
        title="Grants"
        hint="The successor to an access rule: ports, routing, or an application capability."
        count={model.grants.length}
        addLabel="Add grant"
        onAdd={addGrant}
        emptyText="No grants. Headscale 0.29 and newer accept these alongside access rules."
      >
        {model.grants.map((grant, i) => (
          <RuleShell
            key={i}
            label={`grant ${i + 1}`}
            onRemove={() => removeGrant(i)}
            header={<CapabilityKind grant={grant} />}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Source">
                <TokenInput
                  ariaLabel={`Grant ${i + 1} sources`}
                  values={grant.src}
                  onChange={(src) => patchGrant(i, { src })}
                  placeholder="group:eng, autogroup:member"
                  suggestions={srcDstSuggestions}
                />
              </Field>
              <Field label="Destination">
                <TokenInput
                  ariaLabel={`Grant ${i + 1} destinations`}
                  values={grant.dst}
                  onChange={(dst) => patchGrant(i, { dst })}
                  placeholder="tag:db, fileserver"
                  suggestions={srcDstSuggestions}
                />
              </Field>
              <Field
                label="Ports"
                description="Network capability, e.g. tcp:443. A grant may carry only an application capability instead."
              >
                <TokenInput
                  ariaLabel={`Grant ${i + 1} ports`}
                  values={grant.ip}
                  onChange={(ip) => patchGrant(i, { ip })}
                  placeholder="tcp:443, udp:53"
                />
              </Field>
              <Field
                label="Via"
                description="Route the traffic through a tagged subnet router or exit node."
              >
                <TokenInput
                  ariaLabel={`Grant ${i + 1} via`}
                  values={grant.via}
                  onChange={(via) => patchGrant(i, { via })}
                  placeholder="tag:router"
                  suggestions={tagNames}
                />
              </Field>
              <CapabilityEditor
                ariaPrefix={`Grant ${i + 1}`}
                app={grant.app}
                onChange={(app) => patchGrant(i, { app })}
              />
            </div>
          </RuleShell>
        ))}
      </SectionCard>

      {/* SSH rules --------------------------------------------------------- */}
      <SectionCard
        icon={SquareTerminal}
        title="SSH rules"
        hint="Tailscale SSH access, accepted outright or gated by a re-check."
        count={model.ssh.length}
        addLabel="Add rule"
        onAdd={addSsh}
        emptyText="No SSH rules. Add one to let principals open SSH sessions over the tailnet."
      >
        {model.ssh.map((rule, i) => (
          <RuleShell
            key={i}
            label={`ssh ${i + 1}`}
            onRemove={() => removeSsh(i)}
            header={
              <div className="w-32">
                <Select
                  aria-label={`SSH rule ${i + 1} action`}
                  value={rule.action === "check" ? "check" : "accept"}
                  onChange={(event) =>
                    patchSsh(i, { action: event.target.value })
                  }
                  className="h-8 text-xs"
                >
                  <option value="accept">accept</option>
                  <option value="check">check</option>
                </Select>
              </div>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Source">
                <TokenInput
                  ariaLabel={`SSH rule ${i + 1} sources`}
                  values={rule.src}
                  onChange={(src) => patchSsh(i, { src })}
                  placeholder="group:admins, tag:bastion"
                  suggestions={srcDstSuggestions}
                />
              </Field>
              <Field label="Destination">
                <TokenInput
                  ariaLabel={`SSH rule ${i + 1} destinations`}
                  values={rule.dst}
                  onChange={(dst) => patchSsh(i, { dst })}
                  placeholder="tag:prod, autogroup:self"
                  suggestions={srcDstSuggestions}
                />
              </Field>
              <Field
                label="SSH users"
                className="sm:col-span-2"
                description="Local accounts the session may land on, e.g. root, ubuntu, autogroup:nonroot."
              >
                <TokenInput
                  ariaLabel={`SSH rule ${i + 1} users`}
                  values={rule.users}
                  onChange={(users) => patchSsh(i, { users })}
                  placeholder="root, ubuntu"
                  suggestions={groupRefSuggestions}
                />
              </Field>
            </div>
          </RuleShell>
        ))}
      </SectionCard>

      <GroupLabel>Definitions</GroupLabel>

      {/* Groups ------------------------------------------------------------ */}
      <SectionCard
        icon={UsersRound}
        title="Groups"
        hint="Named bundles of users, referenced as group:name in rules."
        count={model.groups.length}
        addLabel="Add group"
        onAdd={addGroup}
        emptyText="No groups defined."
      >
        {model.groups.map((group, i) => (
          <RuleShell key={i} label={`group ${i + 1}`} onRemove={() => removeGroup(i)}>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,15rem)_1fr]">
              <Field label="Name">
                <Input
                  mono
                  aria-label={`Group ${i + 1} name`}
                  value={group.name}
                  onChange={(event) => patchGroup(i, { name: event.target.value })}
                  placeholder="group:engineering"
                />
              </Field>
              <Field label="Members">
                <TokenInput
                  ariaLabel={`Group ${i + 1} members`}
                  values={group.values}
                  onChange={(values) => patchGroup(i, { values })}
                  placeholder="alice@example.com, bob@example.com"
                />
              </Field>
            </div>
          </RuleShell>
        ))}
      </SectionCard>

      {/* Tag owners -------------------------------------------------------- */}
      <SectionCard
        icon={TagIcon}
        title="Tag owners"
        hint="Who may assign each tag:name to a node."
        count={model.tagOwners.length}
        addLabel="Add tag"
        onAdd={addTagOwner}
        emptyText="No tag owners defined."
      >
        {model.tagOwners.map((tag, i) => (
          <RuleShell key={i} label={`tag ${i + 1}`} onRemove={() => removeTagOwner(i)}>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,15rem)_1fr]">
              <Field label="Tag">
                <Input
                  mono
                  aria-label={`Tag ${i + 1} name`}
                  value={tag.name}
                  onChange={(event) => patchTagOwner(i, { name: event.target.value })}
                  placeholder="tag:server"
                />
              </Field>
              <Field label="Owners">
                <TokenInput
                  ariaLabel={`Tag ${i + 1} owners`}
                  values={tag.values}
                  onChange={(values) => patchTagOwner(i, { values })}
                  placeholder="group:ops, alice@example.com"
                  suggestions={groupRefSuggestions}
                />
              </Field>
            </div>
          </RuleShell>
        ))}
      </SectionCard>

      {/* Hosts ------------------------------------------------------------- */}
      <SectionCard
        icon={Server}
        title="Hosts"
        hint="Friendly aliases for fixed CIDRs, usable anywhere a reference is."
        count={model.hosts.length}
        addLabel="Add host"
        onAdd={addHost}
        emptyText="No host aliases defined."
      >
        {model.hosts.map((host, i) => (
          <RuleShell key={i} label={`host ${i + 1}`} onRemove={() => removeHost(i)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <Input
                  mono
                  aria-label={`Host ${i + 1} name`}
                  value={host.name}
                  onChange={(event) => patchHost(i, { name: event.target.value })}
                  placeholder="gateway"
                />
              </Field>
              <Field label="CIDR">
                <Input
                  mono
                  aria-label={`Host ${i + 1} CIDR`}
                  value={host.cidr}
                  onChange={(event) => patchHost(i, { cidr: event.target.value })}
                  placeholder="100.64.0.1/32"
                />
              </Field>
            </div>
          </RuleShell>
        ))}
      </SectionCard>

      {/* Node attributes --------------------------------------------------- */}
      <SectionCard
        icon={SlidersHorizontal}
        title="Node attributes"
        hint="Capabilities handed to every node matching a target."
        count={model.nodeAttrs.length}
        addLabel="Add attribute"
        onAdd={addNodeAttr}
        emptyText="No node attributes. Taildrive, for one, needs drive:share and drive:access here."
      >
        {model.nodeAttrs.map((entry, i) => (
          <RuleShell
            key={i}
            label={`attribute ${i + 1}`}
            onRemove={() => removeNodeAttr(i)}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Targets">
                <TokenInput
                  ariaLabel={`Node attribute ${i + 1} targets`}
                  values={entry.target}
                  onChange={(target) => patchNodeAttr(i, { target })}
                  placeholder="tag:server, autogroup:member, *"
                  suggestions={srcDstSuggestions}
                />
              </Field>
              <Field
                label="Attributes"
                description="Completions cover the documented ones; the set is open, so anything is accepted."
              >
                <TokenInput
                  ariaLabel={`Node attribute ${i + 1} attributes`}
                  values={entry.attr}
                  onChange={(attr) => patchNodeAttr(i, { attr })}
                  placeholder="drive:share"
                  suggestions={ATTR_SUGGESTIONS}
                />
              </Field>
              <CapabilityEditor
                ariaPrefix={`Node attribute ${i + 1}`}
                app={entry.app}
                onChange={(app) => patchNodeAttr(i, { app })}
              />
            </div>
          </RuleShell>
        ))}
      </SectionCard>

      {/* Auto-approvers ---------------------------------------------------- */}
      <Card>
        <CardHeader>
          <div className="flex min-w-0 items-center gap-2.5">
            <SectionIcon icon={ShieldCheck} />
            <div className="flex min-w-0 flex-col">
              <CardTitle>Auto-approvers</CardTitle>
              <span className="text-[11px] text-ink-faint">
                Routes and exit nodes these principals advertise are approved on
                sight.
              </span>
            </div>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-5">
          {/* Route approvers */}
          <div className="flex flex-col gap-2.5">
            <SubHeader
              icon={Route}
              title="Route approvers"
              count={model.autoApprovers.routes.length}
              addLabel="Add route"
              onAdd={addRoute}
            />
            {model.autoApprovers.routes.length === 0 ? (
              <EmptyLine>No auto-approved routes.</EmptyLine>
            ) : (
              model.autoApprovers.routes.map((route, i) => (
                <RuleShell
                  key={i}
                  label={`route ${i + 1}`}
                  onRemove={() => removeRoute(i)}
                >
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,15rem)_1fr]">
                    <Field label="Prefix">
                      <Input
                        mono
                        aria-label={`Route ${i + 1} prefix`}
                        value={route.name}
                        onChange={(event) =>
                          patchRoute(i, { name: event.target.value })
                        }
                        placeholder="10.0.0.0/24"
                      />
                    </Field>
                    <Field label="Approvers">
                      <TokenInput
                        ariaLabel={`Route ${i + 1} approvers`}
                        values={route.values}
                        onChange={(values) => patchRoute(i, { values })}
                        placeholder="tag:router, group:ops"
                      />
                    </Field>
                  </div>
                </RuleShell>
              ))
            )}
          </div>

          <div className="h-px bg-line" />

          {/* Exit-node approvers */}
          <div className="flex flex-col gap-2.5">
            <SubHeader icon={DoorOpen} title="Exit-node approvers" />
            <Field
              label="Approvers"
              description="Principals whose advertised exit node is approved automatically."
            >
              <TokenInput
                ariaLabel="Exit-node approvers"
                values={model.autoApprovers.exitNode}
                onChange={setExitNode}
                placeholder="tag:exit, group:ops"
              />
            </Field>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Which capability a grant actually carries. Worth surfacing: an `app`-only grant
 * looks empty in the Ports field, and a grant with neither is inert.
 */
function CapabilityKind({ grant }: { grant: GrantEntry }) {
  const kinds = [grant.ip.length > 0 && "ip", grant.app && "app"].filter(Boolean);
  return (
    <Chip mono variant={kinds.length > 0 ? "default" : "outline"}>
      {kinds.length > 0 ? kinds.join(" + ") : "no capability"}
    </Chip>
  );
}

/** One capability row while it is being edited: the payload stays text. */
interface CapabilityRow {
  name: string;
  text: string;
}

const BLANK_PAYLOAD = "[\n  {}\n]";

function toRows(app: Record<string, unknown> | undefined): CapabilityRow[] {
  if (!app) return [];
  return Object.entries(app).map(([name, value]) => ({
    name,
    text: JSON.stringify(value, null, 2),
  }));
}

/**
 * Rebuild the capability map from the rows, or report why it cannot be built. The
 * payload must be a JSON array: Tailscale's capability names map to "an array of
 * JSON objects". Its *contents* are never inspected - the policy engine treats
 * them as opaque, so neither do we.
 */
function fromRows(rows: CapabilityRow[]): {
  app?: Record<string, unknown>;
  error?: string;
} {
  const app: Record<string, unknown> = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (name === "") return { error: "A capability needs a name." };
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.text);
    } catch (err) {
      return { error: `${name}: ${err instanceof Error ? err.message : "invalid JSON"}` };
    }
    if (!Array.isArray(parsed)) {
      return { error: `${name}: the payload must be a JSON array.` };
    }
    app[name] = parsed;
  }
  return Object.keys(app).length > 0 ? { app } : {};
}

interface CapabilityEditorProps {
  ariaPrefix: string;
  app?: Record<string, unknown>;
  onChange: (next: Record<string, unknown> | undefined) => void;
}

/**
 * Editor for application capabilities: the name is a plain field, the payload is
 * JSON. Two things it is careful about.
 *
 * Half-typed JSON never reaches the model - the text lives here and is handed
 * upwards only once it parses, so the document cannot be corrupted mid-keystroke
 * and the invalid state is reported inline instead.
 *
 * The rows re-sync when the policy changes *elsewhere* (the JSON tab, another
 * field) but not in response to our own commit, which would otherwise reformat
 * the payload under the cursor.
 */
function CapabilityEditor({ ariaPrefix, app, onChange }: CapabilityEditorProps) {
  const [rows, setRows] = React.useState<CapabilityRow[]>(() => toRows(app));
  const [error, setError] = React.useState<string | null>(null);

  const incomingKey = React.useMemo(() => JSON.stringify(app ?? null), [app]);
  const lastSentKey = React.useRef(incomingKey);
  React.useEffect(() => {
    if (incomingKey !== lastSentKey.current) {
      lastSentKey.current = incomingKey;
      setRows(toRows(app));
      setError(null);
    }
  }, [incomingKey, app]);

  function commit(next: CapabilityRow[]) {
    setRows(next);
    const result = fromRows(next);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    lastSentKey.current = JSON.stringify(result.app ?? null);
    onChange(result.app);
  }

  const patchRow = (i: number, patch: Partial<CapabilityRow>) =>
    commit(rows.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  return (
    <Field
      label="Application capabilities"
      className="sm:col-span-2"
      description="Payload is a JSON array; its contents are opaque to Headscale and to Tailscale's policy engine."
      error={error ?? undefined}
    >
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i} className="rounded-control border border-line bg-surface-2/40 p-2.5">
            <div className="mb-2 flex items-center gap-2">
              <Input
                mono
                aria-label={`${ariaPrefix} capability ${i + 1} name`}
                value={row.name}
                onChange={(event) => patchRow(i, { name: event.target.value })}
                placeholder="tailscale.com/cap/drive"
                className="h-8 text-xs"
              />
              <button
                type="button"
                onClick={() => commit(rows.filter((_, idx) => idx !== i))}
                aria-label={`Remove ${ariaPrefix} capability ${i + 1}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control border border-transparent text-ink-faint transition-colors hover:border-critical-500/30 hover:bg-critical-500/10 hover:text-critical-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-critical-500/40"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            <textarea
              aria-label={`${ariaPrefix} capability ${i + 1} payload`}
              value={row.text}
              onChange={(event) => patchRow(i, { text: event.target.value })}
              rows={4}
              spellCheck={false}
              className="data w-full resize-y rounded-control border border-line-strong bg-surface-2 px-3 py-2 text-[13px] leading-[1.4rem] text-ink transition-colors placeholder:text-ink-faint focus:outline-none focus-visible:border-beacon-500 focus-visible:ring-2 focus-visible:ring-beacon-500/40"
            />
          </div>
        ))}
        <AddButton
          label="Add capability"
          onClick={() => setRows([...rows, { name: "", text: BLANK_PAYLOAD }])}
        />
      </div>
    </Field>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="data text-[11px] uppercase tracking-[0.12em] text-ink-faint">
        {children}
      </span>
      <span className="h-px flex-1 bg-line" aria-hidden />
    </div>
  );
}

function SectionIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control border border-line bg-surface-2 text-ink-muted">
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

interface SectionCardProps {
  icon: LucideIcon;
  title: string;
  hint: string;
  count: number;
  addLabel: string;
  onAdd: () => void;
  emptyText: string;
  children: React.ReactNode;
}

function SectionCard({
  icon,
  title,
  hint,
  count,
  addLabel,
  onAdd,
  emptyText,
  children,
}: SectionCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-center gap-2.5">
          <SectionIcon icon={icon} />
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <CardTitle>{title}</CardTitle>
              <Chip mono variant={count > 0 ? "default" : "outline"}>
                {count}
              </Chip>
            </div>
            <span className="text-[11px] text-ink-faint">{hint}</span>
          </div>
        </div>
        <AddButton label={addLabel} onClick={onAdd} />
      </CardHeader>
      <CardBody className="flex flex-col gap-2.5">
        {count === 0 ? <EmptyLine>{emptyText}</EmptyLine> : children}
      </CardBody>
    </Card>
  );
}

interface SubHeaderProps {
  icon: LucideIcon;
  title: string;
  count?: number;
  addLabel?: string;
  onAdd?: () => void;
}

function SubHeader({ icon: Icon, title, count, addLabel, onAdd }: SubHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
        <span className="text-xs font-medium text-ink">{title}</span>
        {count !== undefined && (
          <Chip mono variant={count > 0 ? "default" : "outline"}>
            {count}
          </Chip>
        )}
      </div>
      {addLabel && onAdd && <AddButton label={addLabel} onClick={onAdd} />}
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-control border border-line-strong bg-surface px-2 text-xs font-medium text-ink-muted transition-colors hover:border-ink-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

interface RuleShellProps {
  label: string;
  onRemove: () => void;
  header?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** A single rule / entry: a hairline sub-panel with a label, controls, remove. */
function RuleShell({ label, onRemove, header, children, className }: RuleShellProps) {
  return (
    <div
      className={cn(
        "rounded-control border border-line bg-surface-2/40 p-3",
        className,
      )}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="data text-[11px] uppercase tracking-[0.08em] text-ink-faint">
          {label}
        </span>
        <div className="flex items-center gap-2">
          {header}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${label}`}
            className="flex h-7 w-7 items-center justify-center rounded-control border border-transparent text-ink-faint transition-colors hover:border-critical-500/30 hover:bg-critical-500/10 hover:text-critical-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-critical-500/40"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="py-1 text-xs text-ink-faint">{children}</p>;
}
