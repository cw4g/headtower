import { Database } from "lucide-react";
import { sessionCan } from "@/lib/authz";
import { Card, CardBody } from "@/components/ui/card";
import { ExportDatabaseButton } from "./export-button";

// The write capability is read fresh per request: this gates a sensitive
// download, not just cosmetic UI, so it must never be served stale.
export const dynamic = "force-dynamic";

export default async function DatabasePage() {
  const canWrite = await sessionCan("settings.write");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-ink">
          Database
        </h2>
        <p className="text-sm text-ink-muted">
          Download a complete copy of Headtower&apos;s own local database, for
          safekeeping off-box.
        </p>
      </div>

      <Card>
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card border border-line bg-surface text-ink-muted">
              <Database className="h-5 w-5" aria-hidden />
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium text-ink">Full backup (.db file)</p>
              <p className="max-w-md text-xs text-ink-muted">
                Includes every Headtower account and session, in-app settings
                (the Headscale connection and OIDC secrets), additional
                identity providers, the audit trail, and tailnet-size history.
                Headscale&apos;s own data - nodes, users, routes, and policy - lives
                in Headscale and is not part of this file.
              </p>
            </div>
          </div>
          <ExportDatabaseButton canWrite={canWrite} />
        </CardBody>
      </Card>

      {!canWrite && (
        <p className="px-1 text-xs text-ink-faint">
          Your role can&apos;t download a backup. Ask an owner or admin for
          access.
        </p>
      )}
    </div>
  );
}
