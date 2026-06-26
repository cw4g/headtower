import { ExternalLink, FileCog, Lock, RefreshCw } from "lucide-react";
import {
  dns,
  type DNSConfig,
  type DNSExtraRecord,
} from "@/lib/headscale";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip, Tag } from "@/components/ui/chip";
import { CopyButton } from "@/components/ui/copy-button";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  Table,
  TableBody,
  TableHead,
  Td,
  Th,
  Tr,
} from "@/components/ui/table";

// DNS values, if ever readable, are live control-plane state; never prebuild.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "DNS",
};

/**
 * Read the live DNS configuration, or null when it isn't exposed.
 *
 * Headscale 0.26 - 0.29 serves no DNS over `/api/v1` (`dns.apiAvailable` is
 * `false`), so there is nothing to read at runtime today. When a future release
 * — or a Headtower config-file reader (see `src/lib/config/`) — surfaces the
 * `dns:` block, return a populated {@link DNSConfig} here and the read-only
 * readout below renders in place of the config-driven notice. No fabricated
 * values: until then this honestly returns null.
 */
function readDnsConfig(): DNSConfig | null {
  // Widened to boolean so the reader stays a real branch, not dead code, once a
  // runtime source exists.
  const available: boolean = dns.apiAvailable;
  if (!available) return null;
  return null;
}

/** The Headscale `dns:` config keys, mapped to our typed {@link DNSConfig}. */
const DNS_KEYS = [
  {
    key: "magic_dns",
    type: "bool",
    field: "magicDns",
    summary:
      "Enable MagicDNS — resolve other nodes by hostname across the tailnet.",
  },
  {
    key: "base_domain",
    type: "string",
    field: "baseDomain",
    summary:
      "The tailnet's DNS suffix (e.g. tailnet.example.com). Must differ from the server's own domain.",
  },
  {
    key: "nameservers.global",
    type: "list",
    field: "nameservers",
    summary:
      "Resolvers pushed to every node. With override_local_dns they replace the node's own resolvers.",
  },
  {
    key: "nameservers.split",
    type: "map",
    field: "splitDns",
    summary:
      "Per-domain resolvers — send queries for specific suffixes to specific servers (split DNS).",
  },
  {
    key: "search_domains",
    type: "list",
    field: "searchDomains",
    summary: "Extra domains appended to unqualified lookups on each node.",
  },
  {
    key: "extra_records",
    type: "records",
    field: "extraRecords",
    summary: "Static A / AAAA records served by MagicDNS for the base domain.",
  },
  {
    key: "override_local_dns",
    type: "bool",
    field: "overrideLocalDns",
    summary:
      "Replace each node's local resolvers with Headscale's, rather than appending to them.",
  },
] satisfies ReadonlyArray<{
  key: string;
  type: string;
  field: keyof DNSConfig;
  summary: string;
}>;

/** A realistic `dns:` block, kept plain (no fake highlighting) for honest copy. */
const EXAMPLE_CONFIG = `dns:
  magic_dns: true
  base_domain: tailnet.example.com
  override_local_dns: true
  nameservers:
    global:
      - 1.1.1.1
      - 9.9.9.9
    split:
      corp.example.com:
        - 10.0.0.53
  search_domains:
    - tailnet.example.com
  extra_records:
    - name: db.tailnet.example.com
      type: A
      value: 100.64.0.42
`;

const HEADSCALE_DNS_DOCS = "https://headscale.net/stable/ref/dns/";
const CONFIG_PATH = "/etc/headscale/config.yaml";

export default function DnsPage() {
  const config = readDnsConfig();

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        eyebrow="Name resolution"
        title={
          <span className="inline-flex items-center gap-2.5">
            DNS
            <Chip variant={config ? "online" : "default"} mono>
              {config ? "active" : "config-file"}
            </Chip>
          </span>
        }
        description="MagicDNS, the tailnet base domain, global and split nameservers, search domains, and static records — all resolved by Headscale from its server config."
      />

      {config ? (
        <DnsReadout config={config} />
      ) : (
        <ConfigDrivenNotice />
      )}

      <ConfigKeyReference />
      <ExampleConfig />
    </div>
  );
}

/**
 * The honest state for 0.26 - 0.29: DNS lives in the config file, with no
 * runtime API to read or change it. Explains where it lives and how changes
 * land, instead of dead editable controls that cannot work.
 */
function ConfigDrivenNotice() {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="grid-field flex items-start gap-4 border-b border-line px-5 py-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card border border-line bg-surface text-ink-faint">
          <FileCog className="h-5 w-5" aria-hidden />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-sm font-medium text-ink">
            Configured in the Headscale config file
          </h2>
          <p className="max-w-2xl text-xs leading-relaxed text-ink-muted">
            Headscale {DNS_RANGE} exposes no DNS over its REST API. The whole{" "}
            <span className="data text-ink">dns:</span> block — MagicDNS,
            nameservers, search domains, split DNS, and static records — is read
            from the server config and applied when Headscale starts. Headtower
            reports the tailnet faithfully, so it won&apos;t show controls that
            can&apos;t take effect.
          </p>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-line text-xs">
        <NoticeRow icon={FileCog} label="Lives in">
          <span className="data text-ink">dns:</span>
          <span className="text-ink-faint"> in </span>
          <span className="data text-ink">{CONFIG_PATH}</span>
        </NoticeRow>
        <NoticeRow icon={RefreshCw} label="Apply changes">
          Edit the file on the host, then restart Headscale —{" "}
          <span className="data text-ink">systemctl restart headscale</span> (or
          restart the container).
        </NoticeRow>
        <NoticeRow icon={Lock} label="Read-only here">
          If a future Headscale release exposes these values, Headtower will
          surface them on this page as a read-only readout.
        </NoticeRow>
        <NoticeRow icon={ExternalLink} label="Reference">
          <a
            href={HEADSCALE_DNS_DOCS}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-beacon-500 transition-colors hover:text-beacon-400"
          >
            Headscale DNS reference
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </NoticeRow>
      </div>
    </div>
  );
}

function NoticeRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof FileCog;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
      <span className="w-28 shrink-0 text-[11px] uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </span>
      <span className="min-w-0 flex-1 leading-relaxed text-ink-muted">
        {children}
      </span>
    </div>
  );
}

/** Reference for every `dns:` key, with its type and what it controls. */
function ConfigKeyReference() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration keys</CardTitle>
        <Chip mono variant="default">
          {DNS_KEYS.length}
        </Chip>
      </CardHeader>
      <div className="flex flex-col divide-y divide-line">
        {DNS_KEYS.map((entry) => (
          <div
            key={entry.key}
            className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4"
          >
            <div className="flex w-full items-center gap-2 sm:w-72 sm:shrink-0">
              <code className="data text-xs text-ink">
                <span className="text-ink-faint">dns.</span>
                {entry.key}
              </code>
              <Chip mono variant="outline" className="ml-auto sm:ml-0">
                {entry.type}
              </Chip>
            </div>
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-muted">
              {entry.summary}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** A copy-paste-ready example of the `dns:` block. */
function ExampleConfig() {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-0.5">
          <CardTitle>Example</CardTitle>
          <p className="data text-[11px] text-ink-faint">{CONFIG_PATH}</p>
        </div>
        <CopyButton value={EXAMPLE_CONFIG} label="Copy example config" />
      </CardHeader>
      <CardBody className="p-0">
        <pre className="data overflow-x-auto px-4 py-4 text-xs leading-relaxed text-ink">
          {EXAMPLE_CONFIG}
        </pre>
      </CardBody>
    </Card>
  );
}

/**
 * Read-only DNS readout. Unused until a runtime source for {@link DNSConfig}
 * exists (see {@link readDnsConfig}); it then renders the live `dns:` values
 * without any editable controls.
 */
function DnsReadout({ config }: { config: DNSConfig }) {
  const splitEntries = Object.entries(config.splitDns);

  return (
    <Card>
      <CardHeader>
        <CardTitle>DNS configuration</CardTitle>
        <Chip variant="default" className="gap-1">
          <Lock className="h-3 w-3" aria-hidden />
          read-only
        </Chip>
      </CardHeader>

      <div className="flex flex-col divide-y divide-line">
        <ReadoutRow label="MagicDNS">
          <Chip mono variant={config.magicDns ? "online" : "default"}>
            {config.magicDns ? "enabled" : "disabled"}
          </Chip>
        </ReadoutRow>

        <ReadoutRow label="Base domain">
          {config.baseDomain ? (
            <code className="data text-xs text-ink">{config.baseDomain}</code>
          ) : (
            <Unset />
          )}
        </ReadoutRow>

        <ReadoutRow label="Override local DNS">
          <Chip mono variant="default">
            {config.overrideLocalDns ? "yes" : "no"}
          </Chip>
        </ReadoutRow>

        <ReadoutRow label="Global nameservers">
          <TagList values={config.nameservers} />
        </ReadoutRow>

        <ReadoutRow label="Search domains">
          <TagList values={config.searchDomains} />
        </ReadoutRow>

        <ReadoutRow label="Split DNS">
          {splitEntries.length === 0 ? (
            <Unset />
          ) : (
            <div className="flex flex-col gap-2">
              {splitEntries.map(([domain, resolvers]) => (
                <div key={domain} className="flex flex-wrap items-center gap-2">
                  <code className="data text-xs text-ink">{domain}</code>
                  <span className="text-ink-faint" aria-hidden>
                    →
                  </span>
                  <TagList values={resolvers} />
                </div>
              ))}
            </div>
          )}
        </ReadoutRow>

        <ReadoutRow label="Extra records">
          <ExtraRecords records={config.extraRecords} />
        </ReadoutRow>
      </div>
    </Card>
  );
}

function ReadoutRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-40 shrink-0 text-[11px] uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function TagList({ values }: { values: string[] }) {
  if (values.length === 0) return <Unset />;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <Tag key={value}>{value}</Tag>
      ))}
    </div>
  );
}

function ExtraRecords({ records }: { records: DNSExtraRecord[] }) {
  if (records.length === 0) return <Unset />;
  return (
    <div className="overflow-hidden rounded-control border border-line">
      <Table>
        <TableHead>
          <Tr className="hover:bg-transparent">
            <Th>Name</Th>
            <Th>Type</Th>
            <Th>Value</Th>
          </Tr>
        </TableHead>
        <TableBody>
          {records.map((record) => (
            <Tr key={`${record.name}-${record.type}-${record.value}`}>
              <Td data className="text-ink">
                {record.name}
              </Td>
              <Td data className="text-ink-muted">
                {record.type}
              </Td>
              <Td data className="text-ink-muted">
                {record.value}
              </Td>
            </Tr>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Unset() {
  return <span className="text-xs text-ink-faint">not set</span>;
}

/** The Headscale version range this page is honest about. */
const DNS_RANGE = "0.26 - 0.29";
