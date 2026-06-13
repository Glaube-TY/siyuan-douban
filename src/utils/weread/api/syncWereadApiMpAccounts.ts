import { updateEndBlocks } from "../updateWereadBlocks";
import { normalizeWereadPositionMark } from "../../core/configDefaults";
import { buildWereadApiMpAccountSyncData } from "./buildWereadApiMpAccountSyncData";
import { buildMpAccountTemplateVariables } from "../mpArticleSync";
import { renderWereadMpAccountTemplate } from "../wereadTemplateRender";
import { findWereadApiBookTargetDoc } from "./findWereadApiBookTargetDoc";
import { preflightWereadApiMpSync } from "./preflightWereadApiMpSync";
import PromiseLimitPool from "@/libs/promise-pool";
import { recordMpAccountInboxDiff } from "../../storage/readingInboxDiff";
import type { MpArticleSyncUnit } from "../mpArticleSync";

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
}

export interface WereadApiMpAccountsSyncResult {
    total: number;
    planned: number;
    success: number;
    failed: number;
    skippedNormalBook: number;
    skippedNotReady: number;
    skippedUnchanged: number;
    items: Array<{
        bookID: string;
        title: string;
        status: "success" | "failed" | "skipped_normal_book" | "skipped_not_ready" | "skipped_unchanged";
        blockID?: string;
        markdownLength?: number;
        articleCount?: number;
        noteCount?: number;
        newBookmarkCount?: number;
        newReviewCount?: number;
        message: string;
    }>;
}

export async function syncWereadApiMpAccounts(
    plugin: WereadPluginLike,
    apiKey: string,
    mpTemplate: string,
    options: { mode: "all" | "update"; forceBookIDs?: string[] }
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

    // 阶段 1：并发准备数据（并发数 2）
    type PreparedMpSyncItem =
      | {
          ok: true;
          bookID: string;
          title: string;
          markdown: string;
          targetBlockID: string;
          markdownLength: number;
          articleCount: number;
          noteCount: number;
          articleUnits: MpArticleSyncUnit[];
        }
      | { ok: false; bookID: string; title: string; message: string };

    const pool = new PromiseLimitPool<PreparedMpSyncItem>(2);

    for (const planned of plannedItems) {
      const bookID = planned.bookID;
      const title = planned.title;

      pool.add(async () => {
        try {
          const syncData = await buildWereadApiMpAccountSyncData(apiKey, bookID);

          const vars = buildMpAccountTemplateVariables(
            syncData.rawBookID,
            syncData.accountInfo,
            syncData.articleUnits,
            syncData.accountInfo.updateTime
          );

          const markdown = renderWereadMpAccountTemplate(mpTemplate, vars);

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
            markdown,
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
    for (const prepared of orderedResults) {
      if (prepared.ok === false) {
        failed++;
        items.push({
          bookID: prepared.bookID,
          title: prepared.title,
          status: "failed",
          message: prepared.message,
        });
        continue;
      }

      try {
        await updateEndBlocks(plugin, prepared.targetBlockID, wereadPositionMark, prepared.markdown);

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
          newBookmarkCount,
          newReviewCount,
          message: "同步成功",
        });
      } catch (error: any) {
        failed++;
        items.push({
          bookID: prepared.bookID,
          title: prepared.title,
          status: "failed",
          message: error?.message || "写入文档失败",
        });
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
        };
        mergedMap.set(bookID, merged);
    }

    const mergedRecords = Array.from(mergedMap.values());
    await plugin.saveData("weread_notebooks", mergedRecords);

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
