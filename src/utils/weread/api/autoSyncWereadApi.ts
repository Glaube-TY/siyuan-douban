import { syncWereadApiNormalBooks, WereadApiNormalBooksSyncResult } from "./syncWereadApiNormalBooks";
import { syncWereadApiMpAccounts, WereadApiMpAccountsSyncResult } from "./syncWereadApiMpAccounts";
import { buildWereadApiNotebookCache } from "./buildWereadApiNotebookCache";
import { showWereadApiNewSourcesDialogAndSync } from "./handleWereadApiNewSources";
import { loadWereadAuthState } from "../../settings/wereadSettingsService";
import { buildWereadSyncReport, saveWereadSyncReportAndApplyStatus } from "../../storage/syncReportBuilder";

interface WereadPluginLike {
  loadData: (key: string) => Promise<any>;
  saveData: (key: string, value: any) => Promise<void>;
  i18n: Record<string, string>;
}

export interface WereadApiAutoSyncResult {
  syncedAt: number;
  normalResult: WereadApiNormalBooksSyncResult;
  mpResult?: WereadApiMpAccountsSyncResult;
  totalPlanned: number;
  totalSuccess: number;
  totalFailed: number;
  message?: string;
}

export async function autoSyncWereadApi(plugin: WereadPluginLike): Promise<WereadApiAutoSyncResult> {
  const startedAt = Date.now();
  const auth = await loadWereadAuthState(plugin);

  const emptyNormalResult: WereadApiNormalBooksSyncResult = {
    total: 0,
    planned: 0,
    success: 0,
    failed: 0,
    skippedMp: 0,
    skippedNotReady: 0,
    skippedUnchanged: 0,
    items: [],
  };

  if (!auth.verified || !auth.apiKey) {
    await saveWereadSyncReportAndApplyStatus(plugin, buildWereadSyncReport({
      startedAt,
      endedAt: Date.now(),
      trigger: "auto",
      normalResult: emptyNormalResult,
      errors: ["API Key 未验证"],
    }));
    throw new Error("API Key 未验证");
  }

  const bookTemplate = (await plugin.loadData("weread_templates") || "").trim();
  if (!bookTemplate) {
    await saveWereadSyncReportAndApplyStatus(plugin, buildWereadSyncReport({
      startedAt,
      endedAt: Date.now(),
      trigger: "auto",
      normalResult: emptyNormalResult,
      errors: ["请先设置书籍模板"],
    }));
    throw new Error("请先设置书籍模板");
  }

  const notebooksList = await buildWereadApiNotebookCache(auth.apiKey);

  if (!Array.isArray(notebooksList) || notebooksList.length === 0) {
    const emptyResult: WereadApiAutoSyncResult = {
      syncedAt: Date.now(),
      normalResult: emptyNormalResult,
      mpResult: undefined,
      totalPlanned: 0,
      totalSuccess: 0,
      totalFailed: 0,
    };
    await saveWereadSyncReportAndApplyStatus(plugin, buildWereadSyncReport({
      startedAt,
      endedAt: Date.now(),
      trigger: "auto",
      normalResult: emptyNormalResult,
      mpResult: undefined,
      warnings: ["有笔记书籍列表为空，本次自动同步没有可处理来源"],
    }));
    await plugin.saveData("weread_api_last_auto_sync_result", emptyResult);
    return emptyResult;
  }

  await plugin.saveData("temporary_weread_notebooksList", notebooksList);
  await plugin.saveData("weread_notebooksList_readyAt", Date.now());

  let normalResult: WereadApiNormalBooksSyncResult = emptyNormalResult;
  let mpResult: WereadApiMpAccountsSyncResult | undefined = undefined;

  const runUpdateSync = async (forceOptions?: { forceBookIDs?: string[]; forceMpBookIDs?: string[] }) => {
    try {
      normalResult = await syncWereadApiNormalBooks(plugin, auth.apiKey, bookTemplate, {
        mode: "update",
        forceBookIDs: forceOptions?.forceBookIDs || []
      });
    } catch (e) {
      normalResult = {
        ...emptyNormalResult,
        failed: 1,
        items: [{ bookID: "", title: "", status: "failed", message: e?.message || "普通书同步异常" }],
      };
    }

    try {
      const mpTemplate = (await plugin.loadData("weread_mp_templates") || "").trim();
      if (mpTemplate) {
        mpResult = await syncWereadApiMpAccounts(plugin, auth.apiKey, mpTemplate, {
          mode: "update",
          forceBookIDs: forceOptions?.forceMpBookIDs || []
        });
      }
    } catch {
      mpResult = undefined;
    }
  };

  try {
    const flowResult = await showWereadApiNewSourcesDialogAndSync(
      plugin,
      auth.apiKey,
      "update",
      runUpdateSync
    );

    if (flowResult === "cancelled") {
      const cancelledResult: WereadApiAutoSyncResult = {
        syncedAt: Date.now(),
        normalResult,
        mpResult,
        totalPlanned: 0,
        totalSuccess: 0,
        totalFailed: 0,
        message: "自动同步已取消",
      };
      await saveWereadSyncReportAndApplyStatus(plugin, buildWereadSyncReport({
        startedAt,
        endedAt: Date.now(),
        trigger: "auto",
        normalResult,
        mpResult,
        cancelled: true,
        warnings: ["自动同步已取消"],
      }));
      await plugin.saveData("weread_api_last_auto_sync_result", cancelledResult);
      return cancelledResult;
    }
  } catch (e) {
    const failedResult: WereadApiAutoSyncResult = {
      syncedAt: Date.now(),
      normalResult,
      mpResult,
      totalPlanned: 0,
      totalSuccess: 0,
      totalFailed: 0,
      message: e?.message || "自动同步异常",
    };
    await saveWereadSyncReportAndApplyStatus(plugin, buildWereadSyncReport({
      startedAt,
      endedAt: Date.now(),
      trigger: "auto",
      normalResult,
      mpResult,
      errors: [e?.message || "自动同步异常"],
    }));
    await plugin.saveData("weread_api_last_auto_sync_result", failedResult);
    return failedResult;
  }

  const totalPlanned = (normalResult.planned || 0) + (mpResult?.planned || 0);
  const totalSuccess = (normalResult.success || 0) + (mpResult?.success || 0);
  const totalFailed = (normalResult.failed || 0) + (mpResult?.failed || 0);

  const result: WereadApiAutoSyncResult = {
    syncedAt: Date.now(),
    normalResult,
    mpResult,
    totalPlanned,
    totalSuccess,
    totalFailed,
  };

  await saveWereadSyncReportAndApplyStatus(plugin, buildWereadSyncReport({
    startedAt,
    endedAt: Date.now(),
    trigger: "auto",
    normalResult,
    mpResult,
  }));

  await plugin.saveData("weread_api_last_auto_sync_result", result);

  return result;
}
