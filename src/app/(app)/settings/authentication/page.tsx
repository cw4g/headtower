import { isOidcEnabled } from "@/lib/auth/oidc";
import { listProviders } from "@/lib/auth/oidc-providers";
import { sessionCan } from "@/lib/authz";
import { AuthenticationForm } from "./authentication-form";
import { sessionSecretState } from "./session-secret";

// The identity model is live config; never prebuild this view.
export const dynamic = "force-dynamic";

/**
 * Whether the console requires sign-in at all - operator mode (none) or
 * single sign-on (at least one enabled identity provider). WHICH providers
 * are available is Settings > Identity providers' job, not this page's; this
 * is purely the on/off switch, plus the env-only session-secret state that
 * gates turning it on.
 */
export default async function AuthenticationPage() {
  const canWrite = await sessionCan("settings.write");
  const initialMode = isOidcEnabled() ? "oidc" : "operator";
  const hasProviders = listProviders().length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-ink">
          Authentication
        </h2>
        <p className="text-sm text-ink-muted">
          How operators sign in to the console. Switch between single-operator
          access and single sign-on - manage which providers can sign you in
          under Identity providers. Changes apply immediately.
        </p>
      </div>

      <AuthenticationForm
        initialMode={initialMode}
        hasProviders={hasProviders}
        sessionSecret={sessionSecretState()}
        canWrite={canWrite}
      />
    </div>
  );
}
