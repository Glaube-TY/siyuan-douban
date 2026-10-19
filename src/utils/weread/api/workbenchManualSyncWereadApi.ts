import { runWereadApiSyncTask, type WereadApiSyncTaskResult } from "./runWereadApiSyncTask";
import { tryRunWereadSync } from "./wereadSyncRunGuard";
import type { WereadSyncProgressCallback, WereadSyncPlanConfirmCallback } from "./wereadSyncProgress";

export type WereadApiWorkbenchManualSyncResult = WereadApiSyncTaskResult;

export async function runWorkbenchManualWereadApiSync(
  plugin: Parameters<typeof runWereadApiSyncTask>[0],
  mode: "all" | "update",
  options?: { onProgress?: WereadSyncProgressCallback; confirmPlan?: WereadSyncPlanConfirmCallback },
): Promise<WereadApiWorkbenchManualSyncResult> {
  let started = false;
  try {
    return await tryRunWereadSync("manual", () => { started = true; return runWereadApiSyncTask(plugin, mode, { ...options, trigger: "manual" }); });
  } catch (error) {
    if (!started) options?.onProgress?.({ stage: "finished", message: error?.message || "Sync failed", status: "failed" });
    throw error;
  }
}
