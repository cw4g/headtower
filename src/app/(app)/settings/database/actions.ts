"use server";

/**
 * Server Action for the local store's sampling cadence.
 *
 * The value is the interval between background tailnet samples, and it doubles
 * as the throttle window for every write path — see `@/lib/sampler` for why one
 * number serves both. Saving it takes effect without a restart: the sampler
 * re-reads the effective config on each of its own ticks, so a change lands
 * within a minute.
 */

import { revalidatePath } from "next/cache";
import {
  ConfigError,
  MAX_SNAPSHOT_INTERVAL_MINUTES,
  setConfig,
} from "@/lib/config";
import { audit, authorize } from "@/lib/authz";

const PATH = "/settings/database";

export type SaveSamplingState =
  | { status: "success"; intervalMinutes: number }
  | { status: "error"; error: string };

/**
 * Persist the sampling interval in minutes. 0 turns background sampling off,
 * leaving only the sample the dashboard records when somebody opens it.
 */
export async function saveSamplingInterval(
  intervalMinutes: number,
): Promise<SaveSamplingState> {
  const gate = await authorize("settings.write");
  if (!gate.ok) return { status: "error", error: gate.reason };

  const minutes = Math.trunc(Number(intervalMinutes));
  if (!Number.isFinite(minutes) || minutes < 0) {
    return { status: "error", error: "Enter 0 or more minutes." };
  }
  if (minutes > MAX_SNAPSHOT_INTERVAL_MINUTES) {
    return {
      status: "error",
      error: `The longest interval is ${MAX_SNAPSHOT_INTERVAL_MINUTES} minutes (a day).`,
    };
  }

  try {
    setConfig({ snapshots: { intervalMinutes: minutes } });
  } catch (error) {
    if (error instanceof ConfigError) {
      return { status: "error", error: error.message };
    }
    throw error;
  }

  await audit(gate.session, {
    action: "settings.sampling.save",
    targetType: "settings",
    detail: { intervalMinutes: minutes },
  });

  revalidatePath(PATH);
  return { status: "success", intervalMinutes: minutes };
}
