import { getConfig, getRawSetting, SETTING_KEYS } from "@/lib/config";
import { sessionCan } from "@/lib/authz";
import { ConnectionForm, type KeyStatus } from "./connection-form";

// The connection is live control-plane config; never prebuild this view.
export const dynamic = "force-dynamic";

/**
 * Edit the Headscale connection (URL + API key) after first run. Reads the
 * effective config server-side and hands the form only non-secret facts: the
 * URL, whether a key is stored (and whether it is still readable), and where the
 * connection resolves from. The raw API key is never sent to the browser.
 */
export default async function ConnectionPage() {
  const config = getConfig();
  const canWrite = await sessionCan("settings.write");

  const initialUrl =
    config.headscale?.url ??
    getRawSetting(SETTING_KEYS.headscaleUrl) ??
    process.env.HEADSCALE_URL?.trim() ??
    "";

  // The raw stored value (not the resolved fallback) so a blank field honestly
  // means "use the Headscale URL above" for the device-enrolment command.
  const initialLoginServerUrl =
    getRawSetting(SETTING_KEYS.headscaleLoginServerUrl) ?? "";

  // Distinguish a usable key from one that's stored but no longer decryptable
  // (HEADTOWER_SECRET rotated away) from none at all - an honest, actionable state.
  const keyStored =
    getRawSetting(SETTING_KEYS.headscaleApiKey) != null ||
    Boolean(process.env.HEADSCALE_API_KEY?.trim());
  const keyStatus: KeyStatus = config.headscale
    ? "set"
    : keyStored
      ? "unreadable"
      : "unset";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-ink">
          Connection
        </h2>
        <p className="text-sm text-ink-muted">
          Where Headtower reaches your Headscale control plane, and the API key it
          authenticates with. Changes apply immediately, without a restart.
        </p>
      </div>

      <ConnectionForm
        initialUrl={initialUrl}
        initialLoginServerUrl={initialLoginServerUrl}
        keyStatus={keyStatus}
        source={config.sources.headscale}
        canWrite={canWrite}
      />
    </div>
  );
}
