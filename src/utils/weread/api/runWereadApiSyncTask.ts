import { getAttributeView, sql } from "@/api";
import { buildBookIdentityRows, normalizeBookTitle } from "../../bookHandling/bookDeduplication";
import { isValidISBN, normalizeISBN } from "../../bookHandling/isbn";
import { validateNoteDocumentBindings } from "../../readingManagement/noteDocumentBinding";
import { loadWereadAuthState } from "../../settings/wereadSettingsService";
import { buildWereadImportFailureReportItem, buildWereadSyncReport, saveWereadSyncReportAndApplyStatus } from "../../storage/syncReportBuilder";
import { loadCustomISBNBooksWithMigration, loadIgnoredBooks } from "../wereadSyncStorage";
import { t } from "../../i18n";
import { buildWereadApiNotebookCache } from "./buildWereadApiNotebookCache";
import { buildWereadApiDatabaseBookDetail } from "./buildWereadApiDatabaseBookDetail";
import { mergeWereadNotebookLocalMetadata } from "./mergeWereadNotebookLocalMetadata";
import { commitWereadNewSources, showWereadApiNewSourcesDialogAndSync, type WereadNewSourceImportFailure, type WereadPendingSyncDraft, type WereadSyncOutcome } from "./handleWereadApiNewSources";
import { planWereadApiNormalBooks, syncWereadApiNormalBooks, type WereadApiNormalBooksSyncResult } from "./syncWereadApiNormalBooks";
import { planWereadApiMpAccounts, syncWereadApiMpAccounts, type WereadApiMpAccountsSyncResult } from "./syncWereadApiMpAccounts";
import { buildWereadSyncPlanSkipBreakdown, wereadSourceKey, type WereadApprovedSyncPlan, type WereadApprovedSyncItem } from "./wereadApprovedSyncPlan";
import { findWereadApiBookTargetDoc } from "./findWereadApiBookTargetDoc";
import { confirmWereadSyncPlan } from "./confirmWereadSyncPlan";
import type { WereadSyncPlanConfirmCallback, WereadSyncPlanItem, WereadSyncProgressCallback } from "./wereadSyncProgress";

interface PluginLike {
  name: string;
  i18n: Record<string, string>;
  loadData: (key: string) => Promise<any>;
  saveData: (key: string, value: any) => Promise<void>;
}

export interface WereadApiSyncTaskResult {
  status: WereadSyncOutcome;
  syncedAt: number;
  normalResult: WereadApiNormalBooksSyncResult;
  mpResult?: WereadApiMpAccountsSyncResult;
  totalPlanned: number;
  totalSuccess: number;
  totalFailed: number;
  message?: string;
}

/** One task owns preparation, the complete approval, and all subsequent writes. */
export async function runWereadApiSyncTask(
  plugin: PluginLike,
  mode: "all" | "update",
  options: { trigger: "manual" | "auto"; onProgress?: WereadSyncProgressCallback; confirmPlan?: WereadSyncPlanConfirmCallback },
): Promise<WereadApiSyncTaskResult> {
  const startedAt = Date.now();
  const normalEmpty: WereadApiNormalBooksSyncResult = { total: 0, planned: 0, success: 0, failed: 0, skippedMp: 0, skippedIgnored: 0, skippedNotReady: 0, skippedUnchanged: 0, items: [] };
  let normalResult = normalEmpty, mpResult: WereadApiMpAccountsSyncResult | undefined;
  let committed = false;
  const importFailures: Array<WereadNewSourceImportFailure & { title: string; sourceType: "book" | "mp" }> = [];
  const result = (status: WereadSyncOutcome, message?: string): WereadApiSyncTaskResult => ({
    status, message, syncedAt: Date.now(), normalResult, mpResult,
    totalPlanned: normalResult.planned + (mpResult?.planned || 0) + importFailures.length,
    totalSuccess: normalResult.success + (mpResult?.success || 0),
    totalFailed: normalResult.failed + (mpResult?.failed || 0) + importFailures.length,
  });
  const changed = () => new Error(t(plugin, "bookUpdateStateChanged", "本地书籍状态已发生变化，请重新搜索后再试。"));
  async function saveReport(error?: string) {
    const report = buildWereadSyncReport({ startedAt, trigger: options.trigger, normalResult, mpResult,
      errors: error ? [error] : undefined });
    for (const failure of importFailures) report.items.push(buildWereadImportFailureReportItem(failure));
    report.failedCount += importFailures.length;
    report.totalSources += importFailures.length;
    if (importFailures.length) report.status = report.successCount ? "partial_success" : "failed";
    await saveWereadSyncReportAndApplyStatus(plugin, report);
  }
  try {
    options.onProgress?.({ stage: "checking_sources", message: t(plugin, "newSourcesChecking", "正在比对本地数据库并检查新书籍和公众号..."), status: "running" });
    const auth = await loadWereadAuthState(plugin, { migrate: false });
    if (!auth.verified || !auth.apiKey) throw new Error(t(plugin, "wereadVerifyApiKeyFirst", "请先验证微信读书 API Key"));
    const template = (await plugin.loadData("weread_templates") || "").trim();
    const mpTemplate = (await plugin.loadData("weread_mp_templates") || "").trim();
    if (!template) throw new Error(t(plugin, "wereadApiManualSyncNeedTemplate", "请先配置微信读书笔记模板"));
    const fresh = await buildWereadApiNotebookCache(auth.apiKey);
    const notebooks = await mergeWereadNotebookLocalMetadata(plugin, fresh, { migrate: false });
    const stateKeys = ["settings.json", "weread_settings", "weread_templates", "weread_mp_templates", "weread_ignoredBooks", "weread_useBookIDBooks", "weread_notebooks", "weread_note_unit_block_index_v1"];
    const readLocalState = async () => JSON.stringify(await Promise.all(stateKeys.map(async key => {
      const value = await plugin.loadData(key); return [key, typeof value, value];
    })));
    const localState = await readLocalState();
    const interactive = !!options.confirmPlan || typeof document !== "undefined";

    async function runDraft(draft: WereadPendingSyncDraft): Promise<WereadSyncOutcome> {
      const newKeys = new Set(draft.allNewSources.map(wereadSourceKey));
      const ignored = [...await loadIgnoredBooks(plugin), ...draft.ignoredBooks];
      // A memory view lets existing planners read the fresh snapshot without saving it.
      const planningPlugin = {
        ...plugin,
        name: plugin.name, i18n: plugin.i18n,
        loadData: async (key: string) => key === "temporary_weread_notebooksList" ? structuredClone(notebooks)
          : key === "weread_ignoredBooks" ? structuredClone(ignored) : plugin.loadData(key),
        saveData: async () => { throw new Error("Read-only WeRead preparation"); },
      };
      const selected = [...draft.selectedBooks, ...draft.useBookIDs];
      for (const book of draft.useBookIDs) {
        if (!draft.remoteDetails.has(book.bookID)) draft.remoteDetails.set(book.bookID, await buildWereadApiDatabaseBookDetail(auth.apiKey, book.bookID));
        if (draft.remoteDetails.get(book.bookID)!.bookId !== book.bookID) throw changed();
      }
      const normalPlan = await planWereadApiNormalBooks(planningPlugin, template, { mode });
      const mpPlan = mpTemplate ? await planWereadApiMpAccounts(planningPlugin, mpTemplate, { mode }) : undefined;
      normalResult = { ...normalEmpty, total: notebooks.length, skippedUnchanged: normalPlan.skippedUnchanged, items: normalPlan.items };
      const preview: (WereadSyncPlanItem & WereadApprovedSyncItem)[] = [];
      for (const source of [...selected, ...draft.ignoredBooks]) {
        const sourceType = wereadSourceKey(source).startsWith("mp:") ? "mp" : "book";
        if (sourceType === "mp" && !mpTemplate && !draft.ignoredBooks.includes(source)) throw new Error(t(plugin, "wereadApiManualSyncNeedTemplate", "请先配置微信读书笔记模板"));
        preview.push({ sourceType, bookID: source.bookID, title: source.title,
          action: draft.ignoredBooks.includes(source) ? "ignore" : sourceType === "mp" ? "import_mp" : draft.useBookIDs.includes(source) ? "import_bookID" : "import_isbn" });
      }
      for (const [sourceType, plan] of [["book", normalPlan], ["mp", mpPlan]] as const) {
        for (const item of plan?.plannedItems || []) {
          if (!newKeys.has(wereadSourceKey({ ...item, sourceType }))) preview.push({ ...item, sourceType, action: "update", blockID: plan!.readyMap.get(item.bookID)?.blockID });
        }
      }
      const unique = Array.from(new Map(preview.map(item => [wereadSourceKey(item), item])).values());

      async function identitySnapshot() {
        const settings = await plugin.loadData("settings.json");
        const databaseID = settings?.bookDatabaseID || "";
        if (!databaseID && unique.length) throw changed();
        if (!databaseID) return "";
        const blocks = await sql('SELECT * FROM blocks WHERE id = "' + databaseID + '"');
        const avID = blocks?.[0]?.markdown?.match(/data-av-id="([^"]+)"/)?.[1];
        if (!avID) throw changed();
        const database = await getAttributeView(avID);
        if (!Array.isArray(database?.av?.keyValues)) throw changed();
        const rows = buildBookIdentityRows(database.av.keyValues);
        const relevant = rows.filter(row => unique.some(item => {
          const source = selected.find(book => book.bookID === item.bookID) || notebooks.find(book => book.bookID === item.bookID);
          const detail = draft.useBookIDs.some(book => book.bookID === item.bookID) ? draft.remoteDetails.get(item.bookID) : undefined;
          const isbn = normalizeISBN(detail?.isbn || source?.isbn);
          return row.bookID === item.bookID || row.docBlockID === item.blockID
            || (isValidISBN(isbn) && row.isbn === isbn) || row.normalizedTitle === normalizeBookTitle(source?.title);
        }));
        const bindings = await validateNoteDocumentBindings(relevant.map(row => row.docBlockID));
        if (Array.from(bindings.values()).some(binding => binding.state === "invalid")) throw changed();
        return JSON.stringify({ avID, columns: database.av.keyValues.filter((column: any) => column.key?.type === "block" || ["ISBN", "bookID"].includes(column.key?.name)).map((column: any) => column.key), rows: relevant.map(({ titleValue, ...row }) => row), bindings: Array.from(bindings.entries()) });
      }
      const identityBefore = await identitySnapshot();
      const skipBreakdown = buildWereadSyncPlanSkipBreakdown(normalPlan.items, mpPlan?.items || [], draft.allNewSources, unique);
      const payload = { mode, sourceType: "mixed" as const, title: t(plugin, "planTitle", "确认微信读书同步"), plannedItems: unique,
        skipBreakdown, skippedCount: skipBreakdown.unchanged + skipBreakdown.notReady + skipBreakdown.ignored };
      if (!unique.length) return "no_work";
      const confirmed = options.trigger === "auto" && !draft.interacted ? true
        : await (options.confirmPlan || (plan => confirmWereadSyncPlan(plugin, plan)))(structuredClone(payload));
      if (!confirmed) return "cancelled";
      // All drift checks are still reads; a rejection here leaves disk untouched.
      if (identityBefore !== await identitySnapshot() || localState !== await readLocalState()
        || JSON.stringify(notebooks) !== JSON.stringify(await mergeWereadNotebookLocalMetadata(plugin, fresh, { migrate: false }))) throw changed();
      const currentAuth = await loadWereadAuthState(plugin, { migrate: false });
      if (!currentAuth.verified || currentAuth.apiKey !== auth.apiKey) throw changed();

      const approval: WereadApprovedSyncPlan = Object.freeze({ items: Object.freeze(unique.map(item => Object.freeze({ ...item }))) });
      committed = true;
      normalResult = normalEmpty;
      await loadWereadAuthState(plugin);
      await loadCustomISBNBooksWithMigration(plugin);
      await plugin.saveData("temporary_weread_notebooksList", notebooks);
      await plugin.saveData("weread_notebooksList_readyAt", Date.now());
      const imports = await commitWereadNewSources(plugin, auth.apiKey, draft.selectedBooks, draft.ignoredBooks, draft.useBookIDs, draft.allNewSources, draft.remoteDetails, approval);
      const successful = new Set([...imports.successfulBookIDs, ...imports.successfulMpBookIDs]);
      for (const failure of imports.failed) {
        const source = selected.find(book => book.bookID === failure.bookID)!;
        importFailures.push({ ...failure, title: source?.title || failure.bookID, sourceType: wereadSourceKey(source || failure).startsWith("mp:") ? "mp" : "book" });
      }
      const cache = await plugin.loadData("temporary_weread_notebooksList");
      if (!Array.isArray(cache)) throw changed();
      if (selected.length) await plugin.saveData("temporary_weread_notebooksList", cache.map(book => selected.some(item => item.bookID === book.bookID)
        ? { ...book, pendingImport: !successful.has(book.bookID) } : book));
      const approvedItems: WereadApprovedSyncItem[] = [];
      for (const item of unique) {
        if (item.action === "ignore") continue;
        if (item.action !== "update" && !successful.has(item.bookID)) continue;
        if (item.action === "update") { approvedItems.push(item); continue; }
        const source = selected.find(book => book.bookID === item.bookID)!;
        const target = await findWereadApiBookTargetDoc(plugin, source, { cleanupOrphans: false });
        if (!target.success || !target.blockID) throw changed();
        approvedItems.push({ ...item, blockID: target.blockID });
      }
      const approvedPlan: WereadApprovedSyncPlan = Object.freeze({ items: Object.freeze(approvedItems.map(item => Object.freeze(item))) });
      normalResult = await syncWereadApiNormalBooks(plugin, auth.apiKey, template, { mode, approvedPlan, forceBookIDs: imports.successfulBookIDs, onProgress: options.onProgress });
      if (mpTemplate) mpResult = await syncWereadApiMpAccounts(plugin, auth.apiKey, mpTemplate, { mode, approvedPlan, forceBookIDs: imports.successfulMpBookIDs, onProgress: options.onProgress });
      return normalResult.failed || mpResult?.failed || importFailures.length ? "failed" : "completed";
    }
    const memoryPlugin = { ...plugin, name: plugin.name, i18n: plugin.i18n, loadData: (key: string) => key === "temporary_weread_notebooksList" ? Promise.resolve(structuredClone(notebooks)) : plugin.loadData(key) };
    const status = await showWereadApiNewSourcesDialogAndSync(memoryPlugin, auth.apiKey, mode, runDraft, options.onProgress, interactive);
    if (committed) await saveReport();
    const output = result(status, status === "cancelled" ? t(plugin, "wereadSyncCancelled", "同步已取消") : status === "failed" ? t(plugin, "wereadSyncFinishedWithError", "微信读书同步完成，部分内容失败") : undefined);
    if (committed && options.trigger === "auto") await plugin.saveData("weread_api_last_auto_sync_result", output);
    options.onProgress?.({ stage: status === "cancelled" ? "cancelled" : "finished", message: t(plugin, status === "cancelled" ? "wereadSyncCancelled" : status === "failed" ? "wereadSyncFinishedWithError" : "wereadSyncFinished", status === "cancelled" ? "同步已取消" : status === "failed" ? "微信读书同步完成，部分内容失败" : "微信读书同步完成"), status: status === "cancelled" ? "cancelled" : status === "failed" ? "failed" : "success" });
    return output;
  } catch (error) {
    if (committed) await saveReport(error?.message || "Sync failed");
    options.onProgress?.({ stage: "finished", message: error?.message || "Sync failed", status: "failed" });
    throw error;
  }
}
