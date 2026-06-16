import { normalizeWereadPositionMark } from "../../core/configDefaults";
import { buildWereadApiMpAccountSyncData } from "./buildWereadApiMpAccountSyncData";
import { findWereadApiBookTargetDoc } from "./findWereadApiBookTargetDoc";
import { preflightWereadApiMpSync } from "./preflightWereadApiMpSync";
import PromiseLimitPool from "@/libs/promise-pool";
import { recordMpAccountInboxDiff } from "../../storage/readingInboxDiff";
import type { MpArticleSyncUnit } from "../mpArticleSync";
import { buildWereadMpRenderModel } from "../incremental/buildMpRenderModel";
import { renderModelToMarkdown } from "../incremental/buildBookRenderModel";
import { syncWereadMpIncremental } from "../incremental/syncMpIncremental";
import { loadWereadNoteUnitBlockIndex } from "../incremental/blockIndexStorage";
import { hasUsableWereadSourceIndexForDoc } from "../incremental/indexValidation";
import { hashText } from "../incremental/hash";
import type { WereadIncrementalSyncStats, WereadRenderModel } from "../incremental/types";
import type { WereadSyncProgressCallback, WereadSyncPlanConfirmCallback, WereadSyncPlanItem } from "./wereadSyncProgress";

interface WereadPluginLike {
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<void>;
    i18n: Record<string, string>;
}

interface OldRecord {
    bookID: string;
    isbn?: string;
    title?: string;
    author?: string;
    updatedTime: number;
    blockID?: string;
    sourceType?: string;
    syncID?: string;
    rawBookID?: string;
    noteCount?: number;
    reviewCount?: number;
    bookmarkCount?: number;
    totalNoteCount?: number;
}

function toNumber(value: any): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function getNotebookCountSignature(record: any): string {
    const noteCount = toNumber(record?.noteCount);
    const reviewCount = toNumber(record?.reviewCount);
    const bookmarkCount = toNumber(record?.bookmarkCount);
    const total = toNumber(record?.totalNoteCount ?? (noteCount + reviewCount + bookmarkCount));
    return `${noteCount}:${reviewCount}:${bookmarkCount}:${total}`;
}

export interface WereadApiMpAccountsSyncResult {
    total: number;
    planned: number;
    success: number;
    failed: number;
    skippedNormalBook: number;
    skippedNotReady: number;
    skippedUnchanged: number;
    cancelled?: boolean;
    items: Array<{
        bookID: string;
        title: string;
        status: "success" | "failed" | "skipped_normal_book" | "skipped_not_ready" | "skipped_unchanged";
        blockID?: string;
        markdownLength?: number;
        articleCount?: number;
        noteCount?: number;
        addedItemCount?: number;
        changedItemCount?: number;
        deletedItemCount?: number;
        unchangedItemCount?: number;
        blockOperationCount?: number;
        rebuilt?: boolean;
        newBookmarkCount?: number;
        newReviewCount?: number;
        message: string;
    }>;
}

export async function syncWereadApiMpAccounts(
    plugin: WereadPluginLike,
    apiKey: string,
    mpTemplate: string,
    options: { mode: "all" | "update"; forceBookIDs?: string[]; onProgress?: WereadSyncProgressCallback; confirmPlan?: WereadSyncPlanConfirmCallback }
): Promise<WereadApiMpAccountsSyncResult> {
    const cache = await plugin.loadData("temporary_weread_notebooksList");

    if (!Array.isArray(cache) || cache.length === 0) {
        return {
            total: 0,
            planned: 0,
            success: 0,
            failed: 1,
            skippedNormalBook: 0,
            skippedNotReady: 0,
            skippedUnchanged: 0,
            items: [{
                bookID: "",
                title: "",
                status: "failed",
                message: "请先拉取有笔记书籍缓存",
            }],
        };
    }

    const preflight = await preflightWereadApiMpSync(plugin);

    const readyItems = preflight.items.filter((i) => i.status === "ready");
    const normalBookItems = preflight.items.filter((i) => i.status === "skipped_normal_book");
    const notReadyItems = preflight.items.filter((i) => i.status === "failed");

    const forceBookIDSet = new Set((options.forceBookIDs || []).filter(Boolean));

    const readyMap = new Map<string, typeof readyItems[0]>();
    for (const item of readyItems) {
        readyMap.set(item.bookID, item);
    }

    for (const forceBookID of forceBookIDSet) {
        if (readyMap.has(forceBookID)) continue;

        const cacheRecord = cache.find((c: any) => (c?.bookID || c?.bookId) === forceBookID);
        if (!cacheRecord) continue;

        const title = cacheRecord?.title || "";
        const sourceType = cacheRecord?.sourceType || "";

        let matched = false;
        for (let attempt = 0; attempt < 8; attempt++) {
            try {
                const result = await findWereadApiBookTargetDoc(
                    plugin,
                    { bookID: forceBookID, title, isbn: "" },
                    { cleanupOrphans: false }
                );

                if (result.success && result.blockID) {
                    readyMap.set(forceBookID, {
                        bookID: forceBookID,
                        title,
                        sourceType,
                        status: "ready",
                        matchType: result.matchType,
                        blockID: result.blockID,
                        message: "强制同步公众号匹配成功",
                    });
                    matched = true;
                    break;
                }
            } catch {}

            if (attempt < 7) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        if (!matched) {
            const existingNotReady = notReadyItems.find((i) => i.bookID === forceBookID);
            if (!existingNotReady) {
                notReadyItems.push({
                    bookID: forceBookID,
                    title,
                    sourceType,
                    status: "failed",
                    message: `强制同步公众号匹配失败（bookID=${forceBookID}）`,
                });
            }
        }
    }

    const finalReadyItems = Array.from(readyMap.values());

    const oldNotebooks: OldRecord[] = await plugin.loadData("weread_notebooks") || [];
    const noteUnitIndex = await loadWereadNoteUnitBlockIndex(plugin);
    const oldMap = new Map<string, OldRecord>();
    for (const old of oldNotebooks) {
        if (old?.bookID) {
            oldMap.set(old.bookID, old);
        }
    }

    const items: Array<{
        bookID: string;
        title: string;
        status: "success" | "failed" | "skipped_normal_book" | "skipped_not_ready" | "skipped_unchanged";
        blockID?: string;
        markdownLength?: number;
        articleCount?: number;
        noteCount?: number;
        addedItemCount?: number;
        changedItemCount?: number;
        deletedItemCount?: number;
        unchangedItemCount?: number;
        blockOperationCount?: number;
        rebuilt?: boolean;
        newBookmarkCount?: number;
        newReviewCount?: number;
        message: string;
    }> = [];

    const plannedMap = new Map<string, { bookID: string; title: string; cacheUpdatedTime?: number }>();
    let skippedUnchanged = 0;

    const skippedUnchangedItems: Array<{
        bookID: string;
        title: string;
        status: "skipped_unchanged";
        blockID?: string;
        message: string;
    }> = [];

    const currentTemplateHash = hashText(mpTemplate);

    for (const ready of finalReadyItems) {
        const bookID = ready.bookID;
        const cacheRecord = cache.find((c: any) => (c?.bookID || c?.bookId) === bookID);
        const currentUpdatedTime = cacheRecord?.updatedTime;
        const title = ready.title || cacheRecord?.title || "";
        const isForced = forceBookIDSet.has(bookID);

        if (options.mode === "all") {
            plannedMap.set(bookID, { bookID, title, cacheUpdatedTime: currentUpdatedTime });
        } else {
            if (isForced) {
                plannedMap.set(bookID, { bookID, title, cacheUpdatedTime: currentUpdatedTime });
                continue;
            }
            const old = oldMap.get(bookID);
            if (!old) {
                plannedMap.set(bookID, { bookID, title, cacheUpdatedTime: currentUpdatedTime });
                continue;
            }
            if (old.updatedTime !== currentUpdatedTime) {
                plannedMap.set(bookID, { bookID, title, cacheUpdatedTime: currentUpdatedTime });
                continue;
            }
            const sourceIndex = noteUnitIndex.sources[`mp:${bookID}`];
            if (!sourceIndex || sourceIndex.templateHash !== currentTemplateHash) {
                plannedMap.set(bookID, { bookID, title, cacheUpdatedTime: currentUpdatedTime });
                continue;
            }
            const hasUsableIndex = await hasUsableWereadSourceIndexForDoc(sourceIndex, ready.blockID);
            if (!hasUsableIndex) {
                plannedMap.set(bookID, { bookID, title, cacheUpdatedTime: currentUpdatedTime });
                continue;
            }
            // updatedTime 不能覆盖删除场景，因此 update 模式必须同时比较数量签名
            const currentCountSignature = getNotebookCountSignature(cacheRecord);
            const oldCountSignature = getNotebookCountSignature(old);
            const hasOldCountSignature = old.noteCount !== undefined || old.reviewCount !== undefined || old.bookmarkCount !== undefined || old.totalNoteCount !== undefined;
            if (!hasOldCountSignature || oldCountSignature !== currentCountSignature) {
                plannedMap.set(bookID, { bookID, title, cacheUpdatedTime: currentUpdatedTime });
                continue;
            }
            skippedUnchanged++;
            skippedUnchangedItems.push({
                bookID,
                title,
                status: "skipped_unchanged",
                blockID: ready.blockID,
                message: "无变化跳过",
            });
            continue;
        }
    }

    for (const nb of normalBookItems) {
        items.push({
            bookID: nb.bookID,
            title: nb.title,
            status: "skipped_normal_book",
            message: "普通书跳过",
        });
    }

    for (const nr of notReadyItems) {
        if (forceBookIDSet.has(nr.bookID) && readyMap.has(nr.bookID)) continue;
        items.push({
            bookID: nr.bookID,
            title: nr.title,
            status: "skipped_not_ready",
            message: nr.message,
        });
    }

    for (const unchanged of skippedUnchangedItems) {
        items.push(unchanged);
    }

    let success = 0;
    let failed = 0;

    const savedPositionMark = await plugin.loadData("weread_position_mark");
    const wereadPositionMark = normalizeWereadPositionMark(savedPositionMark);

    const successBookIDs: string[] = [];

    const plannedItems = Array.from(plannedMap.values());

    // 如果没有需要同步的内容，直接返回
    if (plannedItems.length === 0) {
      if (options.onProgress) {
        options.onProgress({
          stage: "finished",
          sourceType: "mp",
          total: 0,
          message: "公众号没有需要同步的内容",
          status: "success",
        });
      }
      return {
        total: cache.length,
        planned: 0,
        success: 0,
        failed: 0,
        skippedNormalBook: normalBookItems.length,
        skippedNotReady: notReadyItems.filter((i) => !forceBookIDSet.has(i.bookID) || !readyMap.has(i.bookID)).length,
        skippedUnchanged,
        items,
      };
    }

    // 计划确认回调
    if (options.confirmPlan) {
      const planItemsForConfirm: WereadSyncPlanItem[] = plannedItems.map(item => ({
        sourceType: "mp",
        bookID: item.bookID,
        title: item.title,
      }));
      const confirmed = await options.confirmPlan({
        mode: options.mode,
        sourceType: "mp",
        title: "公众号同步",
        plannedItems: planItemsForConfirm,
        skippedCount: skippedUnchanged + normalBookItems.length + notReadyItems.length,
      });
      if (!confirmed) {
        // 用户取消，emit cancelled 事件
        if (options.onProgress) {
          options.onProgress({
            stage: "cancelled",
            sourceType: "mp",
            message: "用户取消公众号同步",
            status: "cancelled",
          });
        }
        return {
          total: cache.length,
          planned: 0,
          success: 0,
          failed: 0,
          skippedNormalBook: normalBookItems.length,
          skippedNotReady: notReadyItems.length,
          skippedUnchanged,
          cancelled: true,
          items,
        };
      }
    }

    // 阶段 1：并发准备数据（并发数 2）
    type PreparedMpSyncItem =
      | {
          ok: true;
          bookID: string;
          title: string;
          model: WereadRenderModel;
          targetBlockID: string;
          markdownLength: number;
          articleCount: number;
          noteCount: number;
          articleUnits: MpArticleSyncUnit[];
        }
      | { ok: false; bookID: string; title: string; message: string };

    if (options.onProgress) {
      options.onProgress({
        stage: "preparing",
        sourceType: "mp",
        total: plannedItems.length,
        message: `准备同步 ${plannedItems.length} 个公众号`,
        status: "running",
      });
    }

    const pool = new PromiseLimitPool<PreparedMpSyncItem>(2);

    for (let i = 0; i < plannedItems.length; i++) {
      const planned = plannedItems[i];
      const bookID = planned.bookID;
      const title = planned.title;

      pool.add(async () => {
        if (options.onProgress) {
          options.onProgress({
            stage: "preparing",
            sourceType: "mp",
            bookID,
            title,
            index: i + 1,
            total: plannedItems.length,
            message: `准备中：《${title || bookID}》`,
            status: "running",
          });
        }

        try {
          const syncData = await buildWereadApiMpAccountSyncData(apiKey, bookID);
          const model = buildWereadMpRenderModel({
            template: mpTemplate,
            syncData,
            bookID,
            title: syncData.accountInfo.accountTitle || title || bookID,
          });
          const markdown = renderModelToMarkdown(model);

          const targetResult = await findWereadApiBookTargetDoc(
            plugin,
            { bookID, title, isbn: "" },
            { cleanupOrphans: false }
          );

          if (!targetResult.success || !targetResult.blockID) {
            return { ok: false, bookID, title, message: targetResult.message || "同步前未找到目标文档" };
          }

          if (!markdown || typeof markdown !== "string" || markdown.length === 0) {
            return { ok: false, bookID, title, message: "渲染后的 Markdown 内容为空" };
          }

          return {
            ok: true,
            bookID,
            title,
            model,
            targetBlockID: targetResult.blockID,
            markdownLength: markdown.length,
            articleCount: syncData.articleCount,
            noteCount: syncData.noteCount,
            articleUnits: syncData.articleUnits,
          };
        } catch (error: any) {
          return { ok: false, bookID, title, message: error?.message || "同步过程中发生未知错误" };
        }
      });
    }

    const preparedResults = await pool.awaitAll();

    // 按 plannedItems 顺序排列
    const preparedMap = new Map<string, PreparedMpSyncItem>();
    for (const result of preparedResults) {
      preparedMap.set(result.bookID, result);
    }

    const orderedResults: PreparedMpSyncItem[] = [];
    for (const planned of plannedItems) {
      orderedResults.push(preparedMap.get(planned.bookID)!);
    }

    // 阶段 2：串行写入
    if (options.onProgress) {
      options.onProgress({
        stage: "writing",
        sourceType: "mp",
        total: orderedResults.length,
        message: `开始写入 ${orderedResults.length} 个公众号`,
        status: "running",
      });
    }

    let writeIndex = 0;
    for (const prepared of orderedResults) {
      writeIndex++;
      if (prepared.ok === false) {
        failed++;
        items.push({
          bookID: prepared.bookID,
          title: prepared.title,
          status: "failed",
          message: prepared.message,
        });
        if (options.onProgress) {
          options.onProgress({
            stage: "item_failed",
            sourceType: "mp",
            bookID: prepared.bookID,
            title: prepared.title,
            index: writeIndex,
            total: orderedResults.length,
            message: `《${prepared.title || prepared.bookID}》准备失败：${prepared.message}`,
            status: "failed",
          });
        }
        continue;
      }

      if (options.onProgress) {
        options.onProgress({
          stage: "writing",
          sourceType: "mp",
          bookID: prepared.bookID,
          title: prepared.title,
          index: writeIndex,
          total: orderedResults.length,
          message: `写入中：《${prepared.title || prepared.bookID}》`,
          status: "running",
        });
      }

      try {
        const incremental = await syncWereadMpIncremental({
          plugin,
          docBlockID: prepared.targetBlockID,
          wereadPositionMark,
          model: prepared.model,
        });
        const stats: WereadIncrementalSyncStats = incremental.stats;

        let newBookmarkCount = 0;
        let newReviewCount = 0;
        try {
          const diff = await recordMpAccountInboxDiff(plugin, {
            bookID: prepared.bookID,
            title: prepared.title,
            noteDocId: prepared.targetBlockID,
            articleUnits: prepared.articleUnits,
          });
          newBookmarkCount = diff.newBookmarkCount;
          newReviewCount = diff.newReviewCount;
        } catch (error) {
          console.warn("[weread] record mp inbox diff failed:", error);
        }

        success++;
        successBookIDs.push(prepared.bookID);
        items.push({
          bookID: prepared.bookID,
          title: prepared.title,
          status: "success",
          blockID: prepared.targetBlockID,
          markdownLength: prepared.markdownLength,
          articleCount: prepared.articleCount,
          noteCount: prepared.noteCount,
          addedItemCount: stats.added,
          changedItemCount: stats.changed,
          deletedItemCount: stats.deleted,
          unchangedItemCount: stats.unchanged,
          blockOperationCount: stats.blockOperationCount,
          rebuilt: stats.rebuilt,
          newBookmarkCount,
          newReviewCount,
          message: `同步成功：新增 ${stats.added} 条，更新 ${stats.changed} 条，删除 ${stats.deleted} 条，未变化 ${stats.unchanged} 条`,
        });
        if (options.onProgress) {
          options.onProgress({
            stage: "item_success",
            sourceType: "mp",
            bookID: prepared.bookID,
            title: prepared.title,
            index: writeIndex,
            total: orderedResults.length,
            message: `《${prepared.title || prepared.bookID}》同步完成：新增 ${stats.added} / 更新 ${stats.changed} / 删除 ${stats.deleted}`,
            status: "success",
          });
        }
      } catch (error: any) {
        failed++;
        items.push({
          bookID: prepared.bookID,
          title: prepared.title,
          status: "failed",
          message: error?.message || "写入文档失败",
        });
        if (options.onProgress) {
          options.onProgress({
            stage: "item_failed",
            sourceType: "mp",
            bookID: prepared.bookID,
            title: prepared.title,
            index: writeIndex,
            total: orderedResults.length,
            message: `《${prepared.title || prepared.bookID}》同步失败：${error?.message || "写入文档失败"}`,
            status: "failed",
          });
        }
      }
    }

    const mergedMap = new Map<string, OldRecord>();
    for (const old of oldNotebooks) {
        if (old?.bookID) {
            mergedMap.set(old.bookID, { ...old });
        }
    }

    for (const bookID of successBookIDs) {
        const cacheRecord = cache.find((c: any) => (c?.bookID || c?.bookId) === bookID);
        const preflightItem = preflight.items.find((i) => i.bookID === bookID) || readyMap.get(bookID);
        const merged: OldRecord = {
            bookID,
            isbn: cacheRecord?.isbn || "",
            title: cacheRecord?.title || "",
            author: cacheRecord?.author || "",
            updatedTime: cacheRecord?.updatedTime || 0,
            blockID: preflightItem?.blockID || mergedMap.get(bookID)?.blockID,
            sourceType: "weread_mp_account",
            syncID: bookID,
            rawBookID: bookID,
            noteCount: toNumber(cacheRecord?.noteCount),
            reviewCount: toNumber(cacheRecord?.reviewCount),
            bookmarkCount: toNumber(cacheRecord?.bookmarkCount),
            totalNoteCount: toNumber(cacheRecord?.totalNoteCount),
        };
        mergedMap.set(bookID, merged);
    }

    const mergedRecords = Array.from(mergedMap.values());
    await plugin.saveData("weread_notebooks", mergedRecords);

    if (options.onProgress) {
      options.onProgress({
        stage: "finished",
        sourceType: "mp",
        total: plannedItems.length,
        message: `公众号同步完成：成功 ${success}，失败 ${failed}，计划 ${plannedItems.length}`,
        status: success > 0 ? "success" : "failed",
      });
    }

    return {
        total: cache.length,
        planned: plannedItems.length,
        success,
        failed,
        skippedNormalBook: normalBookItems.length,
        skippedNotReady: notReadyItems.filter((i) => !forceBookIDSet.has(i.bookID) || !readyMap.has(i.bookID)).length,
        skippedUnchanged,
        items,
    };
}
