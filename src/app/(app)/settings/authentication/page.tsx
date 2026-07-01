import { getConfig, getRawSetting, SETTING_KEYS } from "@/lib/config";
import { sessionCan } from "@/lib/authz";
import { AuthenticationForm } from "./authentication-form";
import { sessionSecretState } from "./session-secret";

// The identity model is live config; never prebuild this view.
export const dynamic = "force-dynamic";

/**
 * Edit how operators sign in: operator (no sign-in) or OIDC single sign-on.
 * Reads the effective config server-side and passes the form only non-secret
 * facts - issuer, client id, and whether a client secret is stored - plus the
 * env-only session-secret state that gates enabling OIDC. The secret is never
 * sent to the browser.
 */
export default async function AuthenticationPage() {
  const config = getConfig();
  const canWrite = await sessionCan("settings.write");

  const initialMode = config.oidc ? "oidc" : "operator";

  // Prefill issuer/id even when OIDC is only partially configured, so an
  // interrupted setup is easy to finish. Both are public (non-secret) values.
  const issuer =
    config.oidc?.issuer ??
    getRawSetting(SETTING_KEYS.oidcIssuer) ??
    process.env.HEADTOWER_OIDC_ISSUER?.trim() ??
    "";
  const clientId =
    config.oidc?.clientId ??
    getRawSetting(SETTING_KEYS.oidcClientId) ??
    process.env.HEADTOWER_OIDC_CLIENT_ID?.trim() ??
    "";
  const secretStored =
    getRawSetting(SETTING_KEYS.oidcClientSecret) != null ||
    Boolean(process.env.HEADTOWER_OIDC_CLIENT_SECRET?.trim());

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-ink">
          Authentication
        </h2>
        <p className="text-sm text-ink-muted">
          How operators sign in to the console. Switch between single-operator
          access and OIDC single sign-on. Changes apply immediately.
        </p>
      </div>

      <AuthenticationForm
        initialMode={initialMode}
        issuer={issuer}
        clientId={clientId}
        secretStored={secretStored}
        source={config.sources.oidc}
        sessionSecret={sessionSecretState()}
        canWrite={canWrite}
      />
    </div>
  );
}
