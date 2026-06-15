/**
 * 工作台首页任务数据聚合（只读）
 * 只读取现有 storage，不写入任何数据，不触发同步，不修改微信读书缓存
 */

import type { ReadingInboxItem, WereadSourceSnapshot } from "../../types/readingInbox";
import type { ReadingBookStatus } from "../../types/readingStatus";
import type { WereadSyncReportStatus } from "../../types/syncReport";
import {
    getReadingInboxItems,
    getReadingBookStatuses,
    getWereadSourceSnapshots,
} from "../storage/readingStorage";
import { getLatestWereadSyncReport } from "../storage/syncReportStorage";
import { loadWereadNoteUnitBlockIndex } from "../weread/incremental/blockIndexStorage";
import type { WereadNoteUnitBlockIndex } from "../weread/incremental/types";

/** 最近新增笔记视图模型 */
export interface WorkbenchRecentNoteView {
    id: string;
    sourceKey: string;
    title: string;
    /** "bookmark" | "review" | "mp_article" */
    itemType: string;
    /** 内容摘要：优先 reviewContent，其次 content */
    summary: string;
    /** 章节名或文章名 */
    sectionLabel: string;
    /** 创建时间 */
    createdAt: number;
    /** 创建时间格式化 */
    createdAtText: string;
    /** 块索引是否已匹配 */
    blockIndexed: boolean;
    /** 匹配到的 headBlockId */
    headBlockId?: string;
    /** 匹配到的 tailBlockId */
    tailBlockId?: string;
}

/** 空状态类型 */
export type EmptyStateType =
    | "no_baseline"
    | "has_baseline_no_new"
    | "sync_failed"
    | "has_new_items";

/** 工作台任务数据 */
export interface WorkbenchTaskData {
    /** 收件箱中未处理或稍后处理的数量 */
    inboxPendingCount: number;

    /** 最近的收件箱条目（前 5 条，带视图模型） */
    recentInboxItems: ReadingInboxItem[];
    /** 最近收件箱条目的视图模型（与 recentInboxItems 同序） */
    recentNoteViews: WorkbenchRecentNoteView[];

    /** 未绑定本地文档的书籍数量 */
    unboundBookCount: number;

    /** 同步问题数量（最近一次同步失败数量或异常状态） */
    syncProblemCount: number;

    /** 待整理书籍数量（hasNewNotes、to_review、reviewing 状态） */
    pendingOrganizeCount: number;

    /** 是否有快照基线 */
    hasSnapshotBaseline: boolean;

    /** 最近一次同步状态 */
    lastSyncStatus: WereadSyncReportStatus | "unknown";

    /** 最近一次同步时间 */
    lastSyncTime: number | null;

    /** 空状态类型 */
    emptyStateType: EmptyStateType;

    /** 最近一次同步：块级新增 */
    latestAddedItemCount: number;
    /** 最近一次同步：块级更新 */
    latestChangedItemCount: number;
    /** 最近一次同步：块级删除 */
    latestDeletedItemCount: number;
    /** 最近一次同步：块变更总数 */
    latestBlockChangeCount: number;
    /** 最近一次同步：块操作数 */
    latestBlockOperationCount: number;
    /** 最近一次同步：重建文档数 */
    latestRebuiltCount: number;
}

/**
 * 获取工作台任务数据（只读）
 * 所有数据来自本地缓存，读取失败时返回安全默认值
 */
export async function getWorkbenchTaskData(plugin: any): Promise<WorkbenchTaskData> {
    try {
        // 并行读取所有需要的数据
        const [inboxItems, bookStatuses, snapshots, latestReport, blockIndex] = await Promise.all([
            getReadingInboxItems(plugin).catch(() => [] as ReadingInboxItem[]),
            getReadingBookStatuses(plugin).catch(() => [] as ReadingBookStatus[]),
            getWereadSourceSnapshots(plugin).catch(() => [] as WereadSourceSnapshot[]),
            getLatestWereadSyncReport(plugin).catch(() => null),
            loadWereadNoteUnitBlockIndex(plugin).catch(() => null),
        ]);

        // 1. 收件箱未处理或稍后处理的数量
        const pendingItems = inboxItems.filter(
            (item) => item.status === "unprocessed" || item.status === "later"
        );
        const inboxPendingCount = pendingItems.length;

        // 2. 最近的收件箱条目（前 5 条，按创建时间降序）
        const recentInboxItems = [...pendingItems]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 5);

        // 3. 构建视图模型（含块索引匹配）
        const recentNoteViews = recentInboxItems.map((item) =>
            buildRecentNoteView(item, blockIndex)
        );

        // 4. 未绑定本地文档的书籍数量
        const unboundBookCount = bookStatuses.filter(
            (status) => !status.noteDocId && !status.syncFailed
        ).length;

        // 5. 同步问题数量
        let syncProblemCount = 0;
        if (latestReport) {
            if (latestReport.failedCount > 0) {
                syncProblemCount = latestReport.failedCount;
            } else if (
                latestReport.status === "failed" ||
                latestReport.status === "partial" ||
                latestReport.status === "partial_success" ||
                (latestReport.errors && latestReport.errors.length > 0)
            ) {
                syncProblemCount = 1;
            } else if (latestReport.warnings && latestReport.warnings.length > 0) {
                syncProblemCount = 1;
            }
        }

        // 6. 待整理书籍数量
        const pendingOrganizeCount = bookStatuses.filter(
            (status) =>
                status.hasNewNotes ||
                status.status === "to_review" ||
                status.status === "reviewing"
        ).length;

        // 7. 是否有快照基线
        const hasSnapshotBaseline = snapshots.length > 0;

        // 8. 最近一次同步状态
        const lastSyncStatus = latestReport?.status || "unknown";

        // 9. 最近一次同步时间
        const lastSyncTime = latestReport?.endedAt || latestReport?.startedAt || null;

        // 10. 块级统计聚合
        let latestAddedItemCount = 0;
        let latestChangedItemCount = 0;
        let latestDeletedItemCount = 0;
        let latestBlockOperationCount = 0;
        let latestRebuiltCount = 0;
        if (latestReport?.items) {
            for (const item of latestReport.items) {
                latestAddedItemCount += item.addedItemCount || 0;
                latestChangedItemCount += item.changedItemCount || 0;
                latestDeletedItemCount += item.deletedItemCount || 0;
                latestBlockOperationCount += item.blockOperationCount || 0;
                if (item.rebuilt) latestRebuiltCount++;
            }
        }
        const latestBlockChangeCount = latestAddedItemCount + latestChangedItemCount + latestDeletedItemCount;

        // 11. 空状态类型
        let emptyStateType: EmptyStateType;
        if (inboxPendingCount > 0) {
            emptyStateType = "has_new_items";
        } else if (
            latestReport &&
            (latestReport.status === "failed" ||
                latestReport.status === "partial" ||
                latestReport.status === "partial_success" ||
                (latestReport.errors && latestReport.errors.length > 0))
        ) {
            emptyStateType = "sync_failed";
        } else if (!hasSnapshotBaseline) {
            emptyStateType = "no_baseline";
        } else {
            emptyStateType = "has_baseline_no_new";
        }

        return {
            inboxPendingCount,
            recentInboxItems,
            recentNoteViews,
            unboundBookCount,
            syncProblemCount,
            pendingOrganizeCount,
            hasSnapshotBaseline,
            lastSyncStatus,
            lastSyncTime,
            emptyStateType,
            latestAddedItemCount,
            latestChangedItemCount,
            latestDeletedItemCount,
            latestBlockChangeCount,
            latestBlockOperationCount,
            latestRebuiltCount,
        };
    } catch (error) {
        console.error("[readingWorkbenchTasks] getWorkbenchTaskData failed:", error);
        return {
            inboxPendingCount: 0,
            recentInboxItems: [],
            recentNoteViews: [],
            unboundBookCount: 0,
            syncProblemCount: 0,
            pendingOrganizeCount: 0,
            hasSnapshotBaseline: false,
            lastSyncStatus: "unknown",
            lastSyncTime: null,
            emptyStateType: "no_baseline",
            latestAddedItemCount: 0,
            latestChangedItemCount: 0,
            latestDeletedItemCount: 0,
            latestBlockChangeCount: 0,
            latestBlockOperationCount: 0,
            latestRebuiltCount: 0,
        };
    }
}

/** 构建最近新增笔记视图模型 */
function buildRecentNoteView(
    item: ReadingInboxItem,
    blockIndex: WereadNoteUnitBlockIndex | null
): WorkbenchRecentNoteView {
    const summary = truncateText(item.reviewContent || item.content, 80);
    const sectionLabel = item.chapterTitle || item.articleTitle || "";
    const createdAtText = formatLocalDateTime(item.createdAt);

    let blockIndexed = false;
    let headBlockId: string | undefined;
    let tailBlockId: string | undefined;

    // 公众号跳过块索引匹配
    if (blockIndex?.sources && item.sourceType !== "weread-mp") {
        const sourceIndex = blockIndex.sources[item.sourceKey];
        if (sourceIndex?.items) {
            for (const indexed of Object.values(sourceIndex.items)) {
                const meta = indexed.meta;
                if (!meta) continue;
                const ids: string[] = [
                    ...(meta.bookmarkIds || []),
                    ...(meta.reviewIds || []),
                ];
                if (ids.includes(item.originalId)) {
                    blockIndexed = true;
                    headBlockId = indexed.headBlockId;
                    tailBlockId = indexed.tailBlockId;
                    break;
                }
            }
        }
    }

    return {
        id: item.id,
        sourceKey: item.sourceKey,
        title: item.title,
        itemType: item.itemType,
        summary,
        sectionLabel,
        createdAt: item.createdAt,
        createdAtText,
        blockIndexed,
        headBlockId,
        tailBlockId,
    };
}

function truncateText(text: string | undefined, maxLen: number): string {
    const s = String(text || "").replace(/[\r\n]+/g, " ").trim();
    return s.length > maxLen ? s.slice(0, maxLen) + "..." : s;
}

function formatLocalDateTime(ts: number): string {
    if (!ts) return "";
    try {
        return new Date(ts).toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return "";
    }
}