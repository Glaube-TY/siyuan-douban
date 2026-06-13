/**
 * 阅读总控制台轻量数据聚合
 * 只读取本地缓存，不发起新请求，不影响同步链路
 */

import type { ReadingCenterOverview } from "../../types/readingCenter";
import { formatReadingDuration } from "../weread/api/formatWereadReadingStats";
import { getReadingBookStatuses, getReadingInboxItems, getReadingReviewItems } from "../storage/readingStorage";
import { getLatestWereadSyncReport } from "../storage/syncReportStorage";

/**
 * 安全读取有笔记书籍缓存
 * 从 temporary_weread_notebooksList 缓存中获取
 */
export async function safeLoadNotebookCache(plugin: any): Promise<any[] | null> {
    try {
        const cache = await plugin.loadData("temporary_weread_notebooksList");
        if (Array.isArray(cache) && cache.length > 0) {
            return cache;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * 安全读取阅读统计缓存
 * 从 weread_reading_stats_cache 缓存中获取
 */
export async function safeLoadReadingStatsCache(plugin: any): Promise<any | null> {
    try {
        const cache = await plugin.loadData("weread_reading_stats_cache");
        if (cache && typeof cache === "object") {
            return cache;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * 统计笔记本缓存中的笔记总数量
 * 按 totalNoteCount ?? noteCount + reviewCount + bookmarkCount 计算
 */
export function countNotebookNotes(notebooks: any[]): number {
    return notebooks.reduce((sum, book) => {
        if (typeof book.totalNoteCount === "number") {
            return sum + book.totalNoteCount;
        }
        const noteCount = typeof book.noteCount === "number" ? book.noteCount : 0;
        const reviewCount = typeof book.reviewCount === "number" ? book.reviewCount : 0;
        const bookmarkCount = typeof book.bookmarkCount === "number" ? book.bookmarkCount : 0;
        return sum + noteCount + reviewCount + bookmarkCount;
    }, 0);
}

/**
 * 获取阅读总览数据
 * 所有数据来自本地缓存，读取失败时返回安全默认值
 */
export async function getReadingCenterOverview(plugin: any): Promise<ReadingCenterOverview> {
    // 安全读取笔记本缓存
    const notebookCache = await safeLoadNotebookCache(plugin);
    const noteBookCount = notebookCache ? notebookCache.length : 0;
    const noteCount = notebookCache ? countNotebookNotes(notebookCache) : 0;

    // 安全读取阅读统计缓存
    const readingStatsCache = await safeLoadReadingStatsCache(plugin);
    const hasReadingStatsCache = readingStatsCache !== null;

    const shelfBookCount = readingStatsCache?.shelf?.total ?? 0;
    const monthlyReadDays = readingStatsCache?.monthly?.readDays ?? 0;

    const weeklySeconds = readingStatsCache?.weekly?.totalReadTime ?? 0;
    const monthlySeconds = readingStatsCache?.monthly?.totalReadTime ?? 0;
    const annualSeconds = readingStatsCache?.annually?.totalReadTime ?? 0;
    const overallSeconds = readingStatsCache?.overall?.totalReadTime ?? 0;

    const inboxItems = await getReadingInboxItems(plugin);
    const newHighlights = inboxItems.filter((item) => item.status === "unprocessed" || item.status === "later").length;

    const statuses = await getReadingBookStatuses(plugin);
    const pendingBookCount = statuses.filter((item) => item.status === "to_review" || item.hasNewNotes).length;

    const reviewItems = await getReadingReviewItems(plugin);
    const now = Date.now();
    const pendingReview = reviewItems.filter((item) => item.status === "active" && item.nextReviewAt <= now).length;

    const latestReport = await getLatestWereadSyncReport(plugin);

    return {
        // 笔记本缓存
        noteBookCount,
        noteCount,
        hasNotebookCache: notebookCache !== null,

        // 阅读统计缓存
        shelfBookCount,
        monthlyReadDays,
        weeklyReadingText: hasReadingStatsCache ? formatReadingDuration(weeklySeconds) : "暂无",
        monthlyReadingText: hasReadingStatsCache ? formatReadingDuration(monthlySeconds) : "暂无",
        annualReadingText: hasReadingStatsCache ? formatReadingDuration(annualSeconds) : "暂无",
        overallReadingText: hasReadingStatsCache ? formatReadingDuration(overallSeconds) : "暂无",
        readingStatsLoadedAt: readingStatsCache?.loadedAt,
        hasReadingStatsCache,

        pendingReview,
        newHighlights,
        pendingBookCount,
        lastSyncStatus: latestReport?.status || "unknown",
        lastSyncTime: latestReport?.endedAt || latestReport?.startedAt,
        lastSyncMessage: latestReport
            ? `成功 ${latestReport.successCount} / 失败 ${latestReport.failedCount} / 跳过 ${latestReport.skippedCount}`
            : undefined,
    };
}
