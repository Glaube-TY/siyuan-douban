import { runWereadApiSyncTask, type WereadApiSyncTaskResult } from "./runWereadApiSyncTask";

export type WereadApiAutoSyncResult = WereadApiSyncTaskResult;

export function autoSyncWereadApi(plugin: Parameters<typeof runWereadApiSyncTask>[0]): Promise<WereadApiAutoSyncResult> {
  return runWereadApiSyncTask(plugin, "update", { trigger: "auto" });
}
