import { getConfig, getRawSetting, SETTING_KEYS } from "@/lib/config";
import { getAgentHealth } from "@/lib/agent";
import { sessionCan } from "@/lib/authz";
import { AgentPanel, type SecretStatus } from "./agent-panel";

// The agent is a live sidecar; never prebuild this view - the health readout
// must reflect the latest probe, not a stale render.
export const dynamic = "force-dynamic";

/**
 * Enable/disable and monitor the optional Headtower agent sidecar (tsnet):
 * richer device metadata than Headscale's API alone reports, plus the bridge
 * that lets browser SSH reach a machine. Reads the effective config and takes
 * a fresh health probe server-side; the SSH secret itself never reaches the
 * browser, only whether one is stored.
 */
export default async function AgentPage() {
  const config = getConfig();
  const canWrite = await sessionCan("settings.write");
  const health = await getAgentHealth();

  // Distinguish a usable secret from one that's stored but no longer
  // decryptable (HEADTOWER_SECRET rotated away) from none at all - the same
  // three-way state the Connection view shows for the Headscale API key.
  const dbSecret = getRawSetting(SETTING_KEYS.agentSshSecret);
  const envSecret = process.env.HEADTOWER_AGENT_SSH_SECRET?.trim();
  const secretStored = dbSecret != null || Boolean(envSecret);
  const secretStatus: SecretStatus = config.agent.sshSecret
    ? "set"
    : secretStored
      ? "unreadable"
      : "unset";
  const secretSource: "db" | "env" | "none" =
    dbSecret != null ? "db" : envSecret ? "env" : "none";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-ink">
          Agent
        </h2>
        <p className="text-sm text-ink-muted">
          The optional tsnet sidecar that enriches device metadata and powers
          browser SSH. Changes apply immediately, without a restart.
        </p>
      </div>

      <AgentPanel
        initialUrl={config.agent.url ?? ""}
        initialEnabled={config.agent.enabled}
        secretStatus={secretStatus}
        secretSource={secretSource}
        initialHealth={health}
        loginServerUrl={config.headscale?.loginServerUrl ?? null}
        canWrite={canWrite}
      />
    </div>
  );
}
