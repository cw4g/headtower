import { FileLock2 } from "lucide-react";
import {
  HeadscaleRequestError,
  policy as policyApi,
  type Policy,
} from "@/lib/headscale";
import { sessionCan } from "@/lib/authz";
import { SectionHeading } from "@/components/ui/section-heading";
import { Chip } from "@/components/ui/chip";
import { ConnectionError } from "@/components/machines/connection-error";
import { PolicyWorkbench } from "./policy-workbench";

// The policy is live control-plane state; always read it fresh, never prebuild.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Access",
};

export default async function AccessPage() {
  let doc: Policy | null = null;
  let error: unknown = null;

  try {
    doc = await policyApi.get();
  } catch (err) {
    error = err;
  }

  // A non-auth request failure on this endpoint almost always means the policy
  // is unset, or Headscale is running in `file` mode (where it owns the
  // document). That's a graceful, expected state — not a connection fault.
  const policyUnavailable =
    error instanceof HeadscaleRequestError &&
    error.status !== 401 &&
    error.status !== 403;

  const document = doc?.policy ?? "";
  const unset = !error && document.trim() === "";
  // Saving the policy requires acls.write; read-only roles get a view-only editor.
  const canSave = await sessionCan("acls.write");

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        eyebrow="Access control"
        title={
          <span className="inline-flex items-center gap-2.5">
            Access
            {!error && (
              <Chip variant={unset ? "default" : "online"} mono>
                {unset ? "unset" : "active"}
              </Chip>
            )}
          </span>
        }
        description="The tailnet's ACL policy: who can reach whom. Build it visually, or author the HuJSON document directly."
      />

      {error && !policyUnavailable ? (
        <ConnectionError error={error} />
      ) : policyUnavailable ? (
        <PolicyUnavailable detail={(error as HeadscaleRequestError).body} />
      ) : (
        <PolicyWorkbench
          initialDocument={document}
          initialUpdatedAt={doc?.updatedAt ?? null}
          unset={unset}
          canSave={canSave}
        />
      )}
    </div>
  );
}

/**
 * Graceful panel for when the policy can't be read but Headscale itself is
 * reachable — the document isn't set yet, or the server is in `file` mode.
 */
function PolicyUnavailable({ detail }: { detail: string }) {
  const message = extractDetail(detail);
  return (
    <div className="grid-field flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line-strong px-6 py-16 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-card border border-line bg-surface text-ink-faint">
        <FileLock2 className="h-5 w-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">No editable policy</p>
        <p className="mx-auto max-w-md text-xs text-ink-muted">
          The control plane returned no policy document. Headscale only serves an
          editable policy when it runs in{" "}
          <span className="data text-ink">policy.mode: database</span>. In{" "}
          <span className="data text-ink">file</span> mode the server owns the
          document and edits happen on the host.
        </p>
        {message && (
          <p className="data mx-auto mt-1 max-w-md break-words text-[11px] text-ink-faint">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

/** Pull a readable message out of a gateway error body, if present. */
function extractDetail(body: string): string | null {
  if (!body) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const message =
        typeof obj.message === "string"
          ? obj.message
          : typeof obj.error === "string"
            ? obj.error
            : undefined;
      if (message && message.trim()) return message.trim();
    }
  } catch {
    // Not JSON; fall through.
  }
  const trimmed = body.trim();
  return trimmed ? trimmed.slice(0, 200) : null;
}
