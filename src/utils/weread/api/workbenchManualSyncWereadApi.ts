import { syncWereadApiNormalBooks, WereadApiNormalBooksSyncResult } from "./syncWereadApiNormalBooks";
import { syncWereadApiMpAccounts, WereadApiMpAccountsSyncResult } from "./syncWereadApiMpAccounts";
import { buildWereadApiNotebookCache } from "./buildWereadApiNotebookCache";
import { showWereadApiNewSourcesDialogAndSync } from "./handleWereadApiNewSources";
import { loadWereadAuthState } from "../../settings/wereadSettingsService";
import { buildWereadSyncReport, saveWereadSyncReportAndApplyStatus } from "../../storage/syncReportBuilder";
import type { WereadSyncProgressCallback, WereadSyncPlanConfirmCallback } from "./wereadSyncProgress";

interface WereadPluginLike {
  loadData: (key: string) => Promise<any>;
  saveData: (key: string, value: any) => Promise<void>;
  i18n: Record<string, string>;
}

export interface WereadApiWorkbenchManualSyncResult {
  syncedAt: number;
  normalResult: WereadApiNormalBooksSyncResult;
  mpResult?: WereadApiMpAccountsSyncResult;
  totalPlanned: number;
  totalSuccess: number;
  totalFailed: number;
  message?: string;
}

export async function runWorkbenchManualWereadApiSync(
  plugin: WereadPluginLike,
  mode: "all" | "update",
  options?: {
    onProgress?: WereadSyncProgressCallback;
    confirmPlan?: WereadSyncPlanConfirmCallback;
  }
): Promise<WereadApiWorkbenchManualSyncResult> {
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
      trigger: "manual",
      normalResult: emptyNormalResult,
      errors: ["API Key 未验证"],
    }));
    throw new Error("请先验证微信读书 API Key");
  }

  const bookTemplate = (await plugin.loadData("weread_templates") || "").trim();
  if (!bookTemplate) {
    await saveWereadSyncReportAndApplyStatus(plugin, buildWereadSyncReport({
      startedAt,
      endedAt: Date.now(),
      trigger: "manual",
      normalResult: emptyNormalResult,
      errors: ["请先设置书籍模板"],
    }));
    throw new Error("请先配置微信读书笔记模板");
  }

  const notebooksList = await buildWereadApiNotebookCache(auth.apiKey);

  if (!Array.isArray(notebooksList) || notebooksList.length === 0) {
    options?.onProgress?.({
      stage: "finished",
      total: 0,
      message: "没有可同步的微信读书来源",
      status: "success",
    });
    const emptyResult: WereadApiWorkbenchManualSyncResult = {
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
      trigger: "manual",
      normalResult: emptyNormalResult,
      mpResult: undefined,
      warnings: ["有笔记书籍列表为空，本次同步没有可处理来源"],
    }));
    return emptyResult;
  }

  await plugin.saveData("temporary_weread_notebooksList", notebooksList);
  await plugin.saveData("weread_notebooksList_readyAt", Date.now());

  let normalResult: WereadApiNormalBooksSyncResult = emptyNormalResult;
  let mpResult: WereadApiMpAccountsSyncResult | undefined = undefined;

  const runSync = async (forceOptions?: { forceBookIDs?: string[]; forceMpBookIDs?: string[] }) => {
    try {
      normalResult = await syncWereadApiNormalBooks(plugin, auth.apiKey, bookTemplate, {
        mode,
        forceBookIDs: forceOptions?.forceBookIDs || [],
        onProgress: options?.onProgress,
        confirmPlan: options?.confirmPlan,
      });
    } catch (e) {
      normalResult = {
        ...emptyNormalResult,
        failed: 1,
        items: [{ bookID: "", title: "", status: "failed", message: e?.message || "普通书同步异常" }],
      };
      options?.onProgress?.({
        stage: "item_failed",
        sourceType: "book",
        title: "普通书同步",
        message: `普通书同步失败：${e?.message || "普通书同步异常"}`,
        status: "failed",
      });
    }

    // 如果普通书同步被取消，不继续执行公众号同步
    if (normalResult.cancelled) {
      return;
    }

    try {
      const mpTemplate = (await plugin.loadData("weread_mp_templates") || "").trim();
      if (mpTemplate) {
        mpResult = await syncWereadApiMpAccounts(plugin, auth.apiKey, mpTemplate, {
          mode,
          forceBookIDs: forceOptions?.forceMpBookIDs || [],
          onProgress: options?.onProgress,
          confirmPlan: options?.confirmPlan,
        });
      }
    } catch (e) {
      mpResult = {
        total: 0,
        planned: 0,
        success: 0,
        failed: 1,
        skippedNormalBook: 0,
        skippedNotReady: 0,
        skippedUnchanged: 0,
        items: [{
          bookID: "",
          title: "公众号同步",
          status: "failed",
          message: e?.message || "公众号同步异常",
        }],
      };
      options?.onProgress?.({
        stage: "item_failed",
        sourceType: "mp",
        title: "公众号同步",
        message: `公众号同步失败：${e?.message || "公众号同步异常"}`,
        status: "failed",
      });
    }
  };

  try {
    const flowResult = await showWereadApiNewSourcesDialogAndSync(
      plugin,
      auth.apiKey,
      mode,
      runSync
    );

    if (flowResult === "cancelled") {
      if (options?.onProgress) {
        options.onProgress({
          stage: "cancelled",
          message: "同步已取消",
          status: "cancelled",
        });
      }
      const cancelledResult: WereadApiWorkbenchManualSyncResult = {
        syncedAt: Date.now(),
        normalResult,
        mpResult,
        totalPlanned: 0,
        totalSuccess: 0,
        totalFailed: 0,
        message: "同步已取消",
      };
      await saveWereadSyncReportAndApplyStatus(plugin, buildWereadSyncReport({
        startedAt,
        endedAt: Date.now(),
        trigger: "manual",
        normalResult,
        mpResult,
        cancelled: true,
        warnings: ["同步已取消"],
      }));
      return cancelledResult;
    }
  } catch (e) {
    options?.onProgress?.({
      stage: "finished",
      message: `同步失败：${e?.message || "同步异常"}`,
      status: "failed",
    });
    const failedResult: WereadApiWorkbenchManualSyncResult = {
      syncedAt: Date.now(),
      normalResult,
      mpResult,
      totalPlanned: 0,
      totalSuccess: 0,
      totalFailed: 0,
      message: e?.message || "同步异常",
    };
    await saveWereadSyncReportAndApplyStatus(plugin, buildWereadSyncReport({
      startedAt,
      endedAt: Date.now(),
      trigger: "manual",
      normalResult,
      mpResult,
      errors: [e?.message || "同步异常"],
    }));
    return failedResult;
  }

  // 检查是否被取消
  const isCancelled = normalResult.cancelled || mpResult?.cancelled;

  const totalPlanned = (normalResult.planned || 0) + (mpResult?.planned || 0);
  const totalSuccess = (normalResult.success || 0) + (mpResult?.success || 0);
  const totalFailed = (normalResult.failed || 0) + (mpResult?.failed || 0);

  // 统一 emit 最终 finished/cancelled 事件（无 sourceType）
  if (options?.onProgress) {
    if (isCancelled) {
      options.onProgress({
        stage: "cancelled",
        message: "同步已取消",
        status: "cancelled",
      });
    } else {
      options.onProgress({
        stage: "finished",
        total: totalPlanned,
        message: `同步完成：计划 ${totalPlanned}，成功 ${totalSuccess}，失败 ${totalFailed}`,
        status: totalFailed > 0 ? "failed" : "success",
      });
    }
  }

  if (isCancelled) {
    const cancelledResult: WereadApiWorkbenchManualSyncResult = {
      syncedAt: Date.now(),
      normalResult,
      mpResult,
      totalPlanned: 0,
      totalSuccess: 0,
      totalFailed: 0,
      message: "同步已取消",
    };
    await saveWereadSyncReportAndApplyStatus(plugin, buildWereadSyncReport({
      startedAt,
      endedAt: Date.now(),
      trigger: "manual",
      normalResult,
      mpResult,
      cancelled: true,
      warnings: ["同步已取消"],
    }));
    return cancelledResult;
  }

  const result: WereadApiWorkbenchManualSyncResult = {
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
    trigger: "manual",
    normalResult,
    mpResult,
  }));

  return result;
}
