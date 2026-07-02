"use client";

import * as React from "react";
import {
  DoorOpen,
  Network,
  Plus,
  Route,
  Server,
  ShieldCheck,
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
  HostEntry,
  NamedList,
  PolicyModel,
  SshRule,
} from "@/lib/policy";

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
