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

    /** 最近的收件箱条目（前 5 条未处理或稍后处理） */
    recentInboxItems: ReadingInboxItem[];

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
}

/**
 * 获取工作台任务数据（只读）
 * 所有数据来自本地缓存，读取失败时返回安全默认值
 */
export async function getWorkbenchTaskData(plugin: any): Promise<WorkbenchTaskData> {
    try {
        // 并行读取所有需要的数据
        const [inboxItems, bookStatuses, snapshots, latestReport] = await Promise.all([
            getReadingInboxItems(plugin).catch(() => [] as ReadingInboxItem[]),
            getReadingBookStatuses(plugin).catch(() => [] as ReadingBookStatus[]),
            getWereadSourceSnapshots(plugin).catch(() => [] as WereadSourceSnapshot[]),
            getLatestWereadSyncReport(plugin).catch(() => null),
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

        // 3. 未绑定本地文档的书籍数量
        const unboundBookCount = bookStatuses.filter(
            (status) => !status.noteDocId && !status.syncFailed
        ).length;

        // 4. 同步问题数量
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

        // 5. 待整理书籍数量（hasNewNotes、to_review、reviewing 状态）
        const pendingOrganizeCount = bookStatuses.filter(
            (status) =>
                status.hasNewNotes ||
                status.status === "to_review" ||
                status.status === "reviewing"
        ).length;

        // 6. 是否有快照基线
        const hasSnapshotBaseline = snapshots.length > 0;

        // 7. 最近一次同步状态
        const lastSyncStatus = latestReport?.status || "unknown";

        // 8. 最近一次同步时间
        const lastSyncTime = latestReport?.endedAt || latestReport?.startedAt || null;

        // 9. 空状态类型
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
            unboundBookCount,
            syncProblemCount,
            pendingOrganizeCount,
            hasSnapshotBaseline,
            lastSyncStatus,
            lastSyncTime,
            emptyStateType,
        };
    } catch (error) {
        console.error("[readingWorkbenchTasks] getWorkbenchTaskData failed:", error);
        return {
            inboxPendingCount: 0,
            recentInboxItems: [],
            unboundBookCount: 0,
            syncProblemCount: 0,
            pendingOrganizeCount: 0,
            hasSnapshotBaseline: false,
            lastSyncStatus: "unknown",
            lastSyncTime: null,
            emptyStateType: "no_baseline",
        };
    }
}