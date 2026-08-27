import {
    loadNotebookCacheStrict,
    loadReadingBookStatusesStrict,
    loadReadingInboxItemsForMutationStrict,
    loadReadingInboxItemsStrict,
    loadWereadAuthSettingsStrict,
    loadWereadNoteUnitBlockIndexStrict,
    loadWereadNotebookRecordsStrict,
    loadWereadSyncReportsStrict,
    saveReadingInboxItemsStrict,
    saveWereadSyncReportsStrict,
} from "./managementStorage";
import type { CacheStatusView, DiagnosticSummary } from "./types";

export async function buildCacheStatus(plugin: any): Promise<CacheStatusView> {
    const [
        temporaryWereadNotebooks,
        wereadNotebooks,
        inboxItems,
        bookStatuses,
        reports,
        blockIndex,
        authSettings,
    ] = await Promise.all([
        loadNotebookCacheStrict(plugin),
        loadWereadNotebookRecordsStrict(plugin),
        loadReadingInboxItemsStrict(plugin),
        loadReadingBookStatusesStrict(plugin),
        loadWereadSyncReportsStrict(plugin),
        loadWereadNoteUnitBlockIndexStrict(plugin),
        loadWereadAuthSettingsStrict(plugin),
    ]);
    const latestReport = [...reports].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0];

    return {
        temporaryWereadNotebookCount: temporaryWereadNotebooks.length,
        wereadNotebookRecordCount: wereadNotebooks.length,
        readingInboxItemCount: inboxItems.length,
        readingBookStatusCount: bookStatuses.length,
        wereadSyncReportCount: reports.length,
        blockIndexSourceCount: Object.keys(blockIndex?.sources || {}).length,
        latestSyncTime: latestReport?.endedAt || latestReport?.startedAt,
        apiKeyEncrypted: !!authSettings.apiKeyEncrypted,
        apiKeyPlainResidual: !!authSettings.apiKey,
    };
}

export async function buildDiagnosticSummary(plugin: any): Promise<DiagnosticSummary> {
    const [cacheStatus, reports] = await Promise.all([
        buildCacheStatus(plugin),
        loadWereadSyncReportsStrict(plugin),
    ]);
    const latestReport = [...reports].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0];
    const recentProblems = (latestReport?.items || [])
        .filter((item) => item.status !== "success")
        .slice(0, 20)
        .map((item) => `${item.title || item.bookID || "未命名来源"}：${item.reasonText || item.status}`);

    return {
        pluginVersion: String(plugin?.version || plugin?.data?.version || "unknown"),
        generatedAt: Date.now(),
        cacheStatus,
        latestReport: latestReport
            ? {
                id: latestReport.id,
                status: latestReport.status,
                startedAt: latestReport.startedAt,
                endedAt: latestReport.endedAt,
                successCount: latestReport.successCount,
                failedCount: latestReport.failedCount,
                skippedCount: latestReport.skippedCount,
                warnings: latestReport.warnings || [],
                errors: latestReport.errors || [],
            }
            : undefined,
        recentProblems,
    };
}

export async function cleanupProcessedInboxItems(plugin: any): Promise<{ removed: number; remaining: number }> {
    const items = await loadReadingInboxItemsForMutationStrict(plugin);
    const remaining = items.filter((item) => item.status !== "processed");
    await saveReadingInboxItemsStrict(plugin, remaining);
    return {
        removed: items.length - remaining.length,
        remaining: remaining.length,
    };
}

export async function keepRecentSyncReports(plugin: any, maxReports = 20): Promise<{ removed: number; remaining: number }> {
    const reports = await loadWereadSyncReportsStrict(plugin);
    const next = [...reports]
        .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
        .slice(0, maxReports);
    await saveWereadSyncReportsStrict(plugin, next);
    return {
        removed: Math.max(0, reports.length - next.length),
        remaining: next.length,
    };
}
