import { KeyRound } from "lucide-react";
import { listProviders } from "@/lib/auth/oidc-providers";
import { sessionCan } from "@/lib/authz";
import { EmptyState } from "@/components/ui/empty-state";
import { ProviderDialog } from "./provider-dialog";
import { ProviderList } from "./provider-list";

// Providers are live config; never prebuild this view.
export const dynamic = "force-dynamic";

/**
 * Manage additional OIDC identity providers beyond the legacy single-provider
 * config (Settings > Authentication). Any number can be enabled at once; each
 * shows as its own button on the login page. Adding, editing, enabling, and
 * deleting all require `settings.write` - a read-only session sees the list
 * without the add/edit/delete controls.
 */
export default async function IdentityProvidersPage() {
  const providers = listProviders();
  const canManage = await sessionCan("settings.write");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold tracking-tight text-ink">
            Identity providers
          </h2>
          <p className="text-sm text-ink-muted">
            Additional sign-in options, alongside single sign-on above. Any
            number can be live at once - each shows as its own button on the
            login page.
          </p>
        </div>
        {providers.length > 0 && canManage && <ProviderDialog />}
      </div>

      {providers.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No additional providers"
          description="Add Google, Okta, Auth0, or another OIDC provider to offer more than one way to sign in."
          action={canManage ? <ProviderDialog /> : undefined}
        />
      ) : (
        <ProviderList providers={providers} canManage={canManage} />
      )}
    </div>
  );
}
