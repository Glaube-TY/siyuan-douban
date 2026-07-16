import type { ReadingInboxItem, ReadingInboxStatus } from "../../types/readingInbox";
import type { ReadingBookStatus } from "../../types/readingStatus";
import type { WereadSyncReport, WereadSyncReportItem } from "../../types/syncReport";
import {
    getReadingBookStatuses,
    getReadingInboxItems,
    getWereadSourceKey,
    normalizeReadingBookStatusSource,
    saveReadingBookStatuses,
} from "../storage/readingStorage";
import { getLatestWereadSyncReport, loadWereadSyncReports } from "../storage/syncReportStorage";
import { safeLoadNotebookCache } from "../readingCenter/readingCenterData";
import { loadWereadNoteUnitBlockIndex } from "../weread/incremental/blockIndexStorage";
import type { WereadNoteUnitBlockIndex, WereadSourceBlockIndex } from "../weread/incremental/types";
import {
    locateInboxItemBlock,
    normalizeSourceKeyForBlockIndex,
    toBlockSourceKey,
    toManagedSourceType,
    toReadingSourceKey,
} from "./blockLocator";
import type {
    BookHealthLevel,
    BookHealthReason,
    BookHealthView,
    BookIndexStatus,
    ReadingManagementSourceType,
    ReadingManagementSummary,
    RecentNoteView,
    SyncChangeReportView,
    SyncChangeSummaryView,
    SyncOutcomeData,
    SyncOutcomeIssue,
    SyncOutcomeIssueCode,
    SyncOutcomeNewContentGroup,
    SyncOutcomeRecord,
} from "./types";
import {
    getNoteDocumentBinding,
    validateNoteDocumentBindings,
    type NoteDocumentBinding,
    type NoteDocumentBindingState,
} from "./noteDocumentBinding";

interface RecentNoteOptions {
    limit?: number;
    status?: ReadingInboxStatus | "pending" | "all";
    itemType?: "bookmark" | "review" | "mp_article" | "all";
    blockStatus?: "all" | "indexed" | "missing";
    sourceKey?: string;
    includeIgnored?: boolean;
    sortBy?: "syncedAt" | "createdAt" | "title" | "status";
}

interface SyncChangeOptions {
    reportId?: string;
    filter?: "all" | "added" | "changed" | "deleted" | "problem" | "rebuilt" | "skipped" | "book" | "mp";
}

interface BookHealthOptions {
    filter?: "all" | "healthy" | "new" | "unbound" | "failed" | "indexMissing" | "indexBroken" | "book" | "mp";
}

export async function buildReadingManagementSummary(plugin: any): Promise<ReadingManagementSummary> {
    try {
        return (await buildSyncOutcomeData(plugin)).summary;
    } catch (error) {
        console.error("[readingManagement] buildReadingManagementSummary failed:", error);
        return {
            inboxPendingCount: 0,
            inboxLaterCount: 0,
            inboxProcessedCount: 0,
            latestAddedItemCount: 0,
            latestChangedItemCount: 0,
            latestDeletedItemCount: 0,
            latestBlockChangeCount: 0,
            latestBlockOperationCount: 0,
            latestRebuiltCount: 0,
            unboundBookCount: 0,
            syncProblemCount: 0,
            healthyBookCount: 0,
            warningBookCount: 0,
            errorBookCount: 0,
            lastSyncStatus: "unknown",
            latestSuccessCount: 0,
            latestFailedCount: 0,
            latestSkippedCount: 0,
            pendingContentCount: 0,
            actionableIssueCount: 0,
        };
    }
}

export async function buildRecentNoteViews(plugin: any, options: RecentNoteOptions = {}): Promise<RecentNoteView[]> {
    try {
        const [items, blockIndex] = await Promise.all([
            getReadingInboxItems(plugin).catch(() => [] as ReadingInboxItem[]),
            loadWereadNoteUnitBlockIndex(plugin).catch(() => null),
        ]);

        const status = options.status || "all";
        const itemType = options.itemType || "all";
        const blockStatus = options.blockStatus || "all";
        let views = items
            .filter((item) => options.includeIgnored || item.status !== "ignored")
            .map((item) => buildRecentNoteView(item, blockIndex));

        views = views.filter((view) => {
            if (status === "pending") {
                if (view.status !== "unprocessed" && view.status !== "later") return false;
            } else if (status !== "all" && view.status !== status) {
                return false;
            }
            if (itemType !== "all") {
                if (itemType === "mp_article" && view.sourceType !== "mp") return false;
                if (itemType !== "mp_article" && view.itemType !== itemType) return false;
            }
            if (blockStatus === "indexed" && !view.blockIndexed) return false;
            if (blockStatus === "missing" && view.blockIndexed) return false;
            if (options.sourceKey && view.sourceKey !== options.sourceKey) return false;
            return true;
        });

        views = sortRecentNoteViews(views, options.sortBy || "syncedAt");
        return typeof options.limit === "number" ? views.slice(0, options.limit) : views;
    } catch (error) {
        console.error("[readingManagement] buildRecentNoteViews failed:", error);
        return [];
    }
}

export async function buildSyncChangeReportView(plugin: any, options: SyncChangeOptions = {}): Promise<SyncChangeReportView | null> {
    try {
        const reports = await loadWereadSyncReports(plugin);
        const report = selectReport(reports, options.reportId);
        if (!report) return null;

        const items = buildSyncChangeViewsFromReport(report).filter((item) => filterSyncChange(item, options.filter || "all"));
        const stats = summarizeReportItems(report.items || []);

        return {
            reportId: report.id,
            startedAt: report.startedAt,
            endedAt: report.endedAt,
            status: report.status,
            statusLabel: getReportStatusLabel(report.status),
            successCount: report.successCount || 0,
            failedCount: report.failedCount || 0,
            skippedCount: report.skippedCount || 0,
            addedItemCount: stats.added,
            changedItemCount: stats.changed,
            deletedItemCount: stats.deleted,
            unchangedItemCount: stats.unchanged,
            blockOperationCount: stats.blockOperations,
            rebuiltCount: stats.rebuilt,
            items,
        };
    } catch (error) {
        console.error("[readingManagement] buildSyncChangeReportView failed:", error);
        return null;
    }
}

export async function buildSyncChangeViews(plugin: any, options: SyncChangeOptions = {}): Promise<SyncChangeSummaryView[]> {
    const reportView = await buildSyncChangeReportView(plugin, options);
    return reportView?.items || [];
}

export async function buildBookHealthViews(plugin: any, options: BookHealthOptions = {}): Promise<BookHealthView[]> {
    try {
        const [statuses, cache, inboxItems, latestReport, blockIndex] = await Promise.all([
            getReadingBookStatuses(plugin).catch(() => [] as ReadingBookStatus[]),
            safeLoadNotebookCache(plugin).catch(() => null),
            getReadingInboxItems(plugin).catch(() => [] as ReadingInboxItem[]),
            getLatestWereadSyncReport(plugin).catch(() => null),
            loadWereadNoteUnitBlockIndex(plugin).catch(() => null),
        ]);

        const merged = mergeBookStatusesWithCache(statuses, cache || []);
        const bindingMap = await validateNoteDocumentBindings(
            merged.map((item) => item.noteDocId || item.noteDocumentCandidateId)
        );
        const validated = merged.map((item) => {
            const binding = getNoteDocumentBinding(item.noteDocId || item.noteDocumentCandidateId, bindingMap);
            return {
                ...item,
                noteDocId: binding.documentId,
                noteDocumentCandidateId: binding.candidateId,
                noteDocumentBindingState: binding.state,
            };
        });
        if (haveStatusBindingsChanged(statuses, validated)) {
            await saveReadingBookStatuses(plugin, validated);
        }

        const views = validated
            .map((item) => buildBookHealthView(item, cache || [], inboxItems, latestReport, blockIndex))
            .filter((item) => filterBookHealth(item, options.filter || "all"))
            .sort((a, b) => {
                const levelOrder: Record<BookHealthLevel, number> = { error: 0, warning: 1, attention: 2, healthy: 3 };
                return levelOrder[a.level] - levelOrder[b.level] || a.title.localeCompare(b.title, "zh-CN");
            });

        return views;
    } catch (error) {
        console.error("[readingManagement] buildBookHealthViews failed:", error);
        return [];
    }
}

export async function buildUnboundBookViews(plugin: any, options: BookHealthOptions = {}): Promise<BookHealthView[]> {
    const filter = options.filter && options.filter !== "all" ? options.filter : "unbound";
    return buildBookHealthViews(plugin, { ...options, filter });
}

export async function buildSyncOutcomeData(plugin: any): Promise<SyncOutcomeData> {
    const [inboxItems, rawStatuses, cache, latestReport, blockIndex] = await Promise.all([
        getReadingInboxItems(plugin).catch(() => [] as ReadingInboxItem[]),
        getReadingBookStatuses(plugin).catch(() => [] as ReadingBookStatus[]),
        safeLoadNotebookCache(plugin).catch(() => null),
        getLatestWereadSyncReport(plugin).catch(() => null),
        loadWereadNoteUnitBlockIndex(plugin).catch(() => null),
    ]);

    const mergedStatuses = mergeBookStatusesWithCache(rawStatuses, cache || []);
    const candidateIds = [
        ...mergedStatuses.map((item) => item.noteDocId || item.noteDocumentCandidateId),
        ...inboxItems.map((item) => item.noteDocId),
        ...(latestReport?.items || []).map((item) => item.noteDocId),
    ];
    const bindingMap = await validateNoteDocumentBindings(candidateIds);

    const statuses = mergedStatuses.map((item) => {
        const binding = getNoteDocumentBinding(item.noteDocId || item.noteDocumentCandidateId, bindingMap);
        return {
            ...item,
            noteDocId: binding.documentId,
            noteDocumentCandidateId: binding.candidateId,
            noteDocumentBindingState: binding.state,
        };
    });
    if (haveStatusBindingsChanged(rawStatuses, statuses)) {
        await saveReadingBookStatuses(plugin, statuses);
    }

    const statusMap = new Map(statuses.map((item) => [item.sourceKey, item]));
    const recentViews = inboxItems
        .filter((item) => item.status !== "ignored")
        .map((item) => {
            const binding = resolveSourceBinding(item.sourceKey, item.noteDocId, statusMap, bindingMap);
            return buildRecentNoteView({ ...item, noteDocId: binding.documentId }, blockIndex);
        });
    const pendingViews = recentViews.filter((item) => item.status === "unprocessed" || item.status === "later");
    const newContentGroups = buildNewContentGroups(pendingViews, statusMap, bindingMap);

    const reportView = latestReport ? buildReportView(latestReport, statusMap, bindingMap) : null;
    const issues = buildSyncOutcomeIssues(statuses, cache || [], latestReport, blockIndex, bindingMap);
    const issueSourceKeys = new Set(issues.map((item) => item.sourceKey));
    const records = (reportView?.items || []).map((item): SyncOutcomeRecord => {
        const binding = resolveSourceBinding(item.sourceKey, item.noteDocId, statusMap, bindingMap);
        return {
            ...item,
            noteDocId: binding.documentId,
            noteDocumentBindingState: binding.state,
            hasChanges: item.addedItemCount > 0 || item.changedItemCount > 0 || item.deletedItemCount > 0,
            hasProblem: issueSourceKeys.has(item.sourceKey),
        };
    });
    const reportStats = summarizeReportItems(latestReport?.items || []);
    const failedSources = new Set(issues.filter((item) => item.issueCode === "sync_failed").map((item) => item.sourceKey));
    const warningSources = new Set(issues
        .filter((item) => item.issueCode === "index_broken" || item.issueCode === "document_missing" || item.issueCode === "document_invalid")
        .map((item) => item.sourceKey));
    const allSourceKeys = new Set(statuses.filter((item) => item.sourceType !== "local-book").map((item) => item.sourceKey));
    const healthyBookCount = Array.from(allSourceKeys).filter((key) => !issues.some((item) => item.sourceKey === key)).length;

    const summary: ReadingManagementSummary = {
        inboxPendingCount: inboxItems.filter((item) => item.status === "unprocessed").length,
        inboxLaterCount: inboxItems.filter((item) => item.status === "later").length,
        inboxProcessedCount: inboxItems.filter((item) => item.status === "processed").length,
        latestAddedItemCount: reportStats.added,
        latestChangedItemCount: reportStats.changed,
        latestDeletedItemCount: reportStats.deleted,
        latestBlockChangeCount: reportStats.added + reportStats.changed + reportStats.deleted,
        latestBlockOperationCount: reportStats.blockOperations,
        latestRebuiltCount: reportStats.rebuilt,
        unboundBookCount: issues.filter((item) => item.issueCode === "unbound_with_notes").length,
        syncProblemCount: issues.length,
        healthyBookCount,
        warningBookCount: warningSources.size,
        errorBookCount: failedSources.size,
        lastSyncTime: latestReport?.endedAt || latestReport?.startedAt,
        lastSyncStatus: latestReport?.status || "unknown",
        latestSuccessCount: latestReport?.successCount || 0,
        latestFailedCount: latestReport?.failedCount || 0,
        latestSkippedCount: latestReport?.skippedCount || 0,
        pendingContentCount: pendingViews.length,
        actionableIssueCount: issues.length,
    };

    return { latestReport: reportView, summary, newContentGroups, issues, records };
}

function buildReportView(
    report: WereadSyncReport,
    statusMap: Map<string, ReadingBookStatus>,
    bindingMap: Map<string, NoteDocumentBinding>
): SyncChangeReportView {
    const stats = summarizeReportItems(report.items || []);
    const items = buildSyncChangeViewsFromReport(report).map((item) => {
        const binding = resolveSourceBinding(item.sourceKey, item.noteDocId, statusMap, bindingMap);
        return { ...item, noteDocId: binding.documentId };
    });
    return {
        reportId: report.id,
        startedAt: report.startedAt,
        endedAt: report.endedAt,
        status: report.status,
        statusLabel: getReportStatusLabel(report.status),
        successCount: report.successCount || 0,
        failedCount: report.failedCount || 0,
        skippedCount: report.skippedCount || 0,
        addedItemCount: stats.added,
        changedItemCount: stats.changed,
        deletedItemCount: stats.deleted,
        unchangedItemCount: stats.unchanged,
        blockOperationCount: stats.blockOperations,
        rebuiltCount: stats.rebuilt,
        items,
    };
}

function buildNewContentGroups(
    views: RecentNoteView[],
    statusMap: Map<string, ReadingBookStatus>,
    bindingMap: Map<string, NoteDocumentBinding>
): SyncOutcomeNewContentGroup[] {
    const groups = new Map<string, RecentNoteView[]>();
    for (const view of views) {
        const current = groups.get(view.sourceKey) || [];
        current.push(view);
        groups.set(view.sourceKey, current);
    }

    return Array.from(groups.entries()).map(([sourceKey, items]) => {
        const sortedItems = [...items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const first = sortedItems[0];
        const binding = resolveSourceBinding(sourceKey, first.noteDocId, statusMap, bindingMap);
        return {
            sourceKey,
            sourceType: first.sourceType,
            bookID: first.bookID,
            title: first.title,
            totalCount: sortedItems.length,
            bookmarkCount: sortedItems.filter((item) => item.itemType === "bookmark" && item.sourceType !== "mp").length,
            reviewCount: sortedItems.filter((item) => item.itemType === "review" && item.sourceType !== "mp").length,
            mpArticleCount: sortedItems.filter((item) => item.sourceType === "mp").length,
            latestDiscoveredAt: first.createdAt,
            latestDiscoveredAtText: formatLocalDateTime(first.createdAt),
            noteDocId: binding.documentId,
            noteDocumentBindingState: binding.state,
            items: sortedItems.map((item) => ({ ...item, noteDocId: binding.documentId })),
        };
    }).sort((a, b) => (b.latestDiscoveredAt || 0) - (a.latestDiscoveredAt || 0));
}

function buildSyncOutcomeIssues(
    statuses: ReadingBookStatus[],
    cache: any[],
    latestReport: WereadSyncReport | null,
    blockIndex: WereadNoteUnitBlockIndex | null,
    bindingMap: Map<string, NoteDocumentBinding>
): SyncOutcomeIssue[] {
    const descriptors = new Map<string, ReadingBookStatus>();
    for (const status of statuses) {
        if (status.sourceType !== "local-book") descriptors.set(status.sourceKey, status);
    }
    for (const reportItem of latestReport?.items || []) {
        const sourceType = toManagedSourceType(reportItem.sourceType);
        const sourceKey = toReadingSourceKey(sourceType, reportItem.bookID);
        if (!descriptors.has(sourceKey)) {
            descriptors.set(sourceKey, {
                sourceKey,
                sourceType: sourceType === "mp" ? "weread-mp" : "weread-book",
                bookID: reportItem.bookID,
                title: reportItem.title || reportItem.bookID,
                status: "not_started",
                updatedAt: latestReport?.endedAt || latestReport?.startedAt || Date.now(),
                noteDocId: reportItem.noteDocId,
            });
        }
    }

    const issueMap = new Map<string, SyncOutcomeIssue>();
    const addIssue = (issue: SyncOutcomeIssue) => {
        issueMap.set(`${issue.sourceKey}:${issue.issueCode}`, issue);
    };

    for (const status of descriptors.values()) {
        const sourceType = toManagedSourceType(status.sourceType);
        const bookID = status.bookID || status.sourceKey.split(":").pop() || "";
        const sourceKey = toReadingSourceKey(sourceType, bookID);
        const cached = findCachedBook(cache, sourceType, bookID);
        const reportItem = findReportItem(latestReport, sourceType, bookID, sourceKey);
        const binding = getNoteDocumentBinding(
            status.noteDocId || status.noteDocumentCandidateId || reportItem?.noteDocId,
            bindingMap
        );
        const title = status.title || cached?.title || reportItem?.title || bookID || "未命名来源";
        const noteCount = getCachedNoteCount(cached) || 0;
        const hasWereadContent = noteCount > 0 || !!status.hasNewNotes || (status.lastNewNoteCount || 0) > 0;
        const hasSourceSyncHistory = !!reportItem || !!status.lastSyncedAt || !!status.syncFailed;

        if (binding.state === "missing") {
            addIssue(createIssue(sourceKey, sourceType, bookID, title, "document_missing", binding));
        } else if (binding.state === "invalid") {
            addIssue(createIssue(sourceKey, sourceType, bookID, title, "document_invalid", binding));
        } else if (binding.state === "not_created" && hasWereadContent && hasSourceSyncHistory) {
            addIssue(createIssue(sourceKey, sourceType, bookID, title, "unbound_with_notes", binding));
        }

        const syncFailed = status.syncFailed || reportItem?.status === "failed";
        if (syncFailed) {
            addIssue(createIssue(sourceKey, sourceType, bookID, title, "sync_failed", binding, reportItem?.reasonText || status.lastSyncError));
        }

        const blockSourceKey = normalizeSourceKeyForBlockIndex(sourceKey, status.sourceType, bookID);
        const indexStatus = getIndexStatus(blockIndex?.sources?.[blockSourceKey]);
        if (indexStatus === "broken" && syncFailed) {
            addIssue(createIssue(sourceKey, sourceType, bookID, title, "index_broken", binding));
        }
    }

    if (latestReport?.status === "failed" && !(latestReport.items || []).some((item) => item.status === "failed")) {
        addIssue({
            id: "sync:latest:sync_failed",
            sourceKey: "sync:latest",
            sourceType: "book",
            title: "最近一次同步",
            issueCode: "sync_failed",
            reason: latestReport.errors?.[0] || "最近一次同步失败，请查看同步记录确认原因。",
            action: "open_records",
            actionLabel: "查看同步记录",
            noteDocumentBindingState: "not_created",
        });
    }

    const order: Record<SyncOutcomeIssueCode, number> = {
        sync_failed: 0,
        document_missing: 1,
        document_invalid: 2,
        unbound_with_notes: 3,
        index_broken: 4,
    };
    return Array.from(issueMap.values()).sort((a, b) => order[a.issueCode] - order[b.issueCode] || a.title.localeCompare(b.title, "zh-CN"));
}

function createIssue(
    sourceKey: string,
    sourceType: ReadingManagementSourceType,
    bookID: string,
    title: string,
    issueCode: SyncOutcomeIssueCode,
    binding: NoteDocumentBinding,
    detail?: string
): SyncOutcomeIssue {
    const config: Record<SyncOutcomeIssueCode, Pick<SyncOutcomeIssue, "reason" | "action" | "actionLabel">> = {
        unbound_with_notes: {
            reason: "微信读书已有笔记内容，但尚未绑定真实的读书笔记文档。",
            action: "open_shelf",
            actionLabel: "打开书架检查",
        },
        document_missing: {
            reason: "原绑定的读书笔记文档已经不存在，请检查书架中的绑定。",
            action: "open_shelf",
            actionLabel: "打开书架检查",
        },
        document_invalid: {
            reason: "绑定 ID 指向的块不是文档块，请检查书架中的绑定。",
            action: "open_shelf",
            actionLabel: "打开书架检查",
        },
        sync_failed: {
            reason: detail || "最近一次同步失败，请查看同步记录确认原因。",
            action: "open_records",
            actionLabel: "查看同步记录",
        },
        index_broken: {
            reason: "已有块索引结构损坏，并且已经影响最近同步。",
            action: "open_diagnostics",
            actionLabel: "查看诊断信息",
        },
    };
    return {
        id: `${sourceKey}:${issueCode}`,
        sourceKey,
        sourceType,
        bookID,
        title,
        issueCode,
        ...config[issueCode],
        noteDocumentBindingState: binding.state,
        noteDocId: binding.documentId,
    };
}

function resolveSourceBinding(
    sourceKey: string,
    candidateId: string | undefined,
    statusMap: Map<string, ReadingBookStatus>,
    bindingMap: Map<string, NoteDocumentBinding>
): NoteDocumentBinding {
    const readingKey = sourceKey.startsWith("book:")
        ? sourceKey.replace(/^book:/, "weread-book:")
        : sourceKey.startsWith("mp:")
            ? sourceKey.replace(/^mp:/, "weread-mp:")
            : sourceKey;
    const status = statusMap.get(sourceKey) || statusMap.get(readingKey);
    return getNoteDocumentBinding(
        candidateId || status?.noteDocId || status?.noteDocumentCandidateId,
        bindingMap
    );
}

function haveStatusBindingsChanged(before: ReadingBookStatus[], after: ReadingBookStatus[]): boolean {
    if (before.length !== after.length) return true;
    const beforeMap = new Map(before.map((item) => [item.sourceKey, item]));
    return after.some((item) => {
        const previous = beforeMap.get(item.sourceKey);
        return !previous
            || previous.noteDocId !== item.noteDocId
            || previous.noteDocumentCandidateId !== item.noteDocumentCandidateId
            || previous.noteDocumentBindingState !== item.noteDocumentBindingState;
    });
}

function buildRecentNoteView(
    item: ReadingInboxItem,
    blockIndex: WereadNoteUnitBlockIndex | null
): RecentNoteView {
    const locatedBlock = locateInboxItemBlock(item, blockIndex);
    const sourceType = toManagedSourceType(item.sourceType);
    const content = String(item.content || "");
    const comment = String(item.reviewContent || "");
    const summary = truncateText(comment || content, 96);
    const sectionLabel = item.articleTitle || item.chapterTitle || "";
    const typeLabel = sourceType === "mp" ? "公众号" : item.itemType === "review" ? "评论" : "划线";

    return {
        id: item.id,
        sourceKey: item.sourceKey,
        sourceType,
        readingSourceType: item.sourceType,
        bookID: item.bookID,
        title: item.title || item.bookID || "未命名来源",
        chapterTitle: item.chapterTitle,
        articleTitle: item.articleTitle,
        itemType: item.itemType,
        typeLabel,
        content,
        comment,
        summary,
        sectionLabel,
        createdAt: item.createdAt,
        syncedAt: item.createdAt,
        createdAtText: formatLocalDateTime(item.createdAt),
        discoveredAtText: formatLocalDateTime(item.createdAt),
        status: item.status,
        statusLabel: getInboxStatusLabel(item.status),
        blockIndexed: !!locatedBlock,
        blockStatusLabel: locatedBlock ? "已定位到同步块" : "还没有定位到对应的思源块",
        headBlockId: locatedBlock?.headBlockId,
        tailBlockId: locatedBlock?.tailBlockId,
        itemId: locatedBlock?.itemId,
        noteDocId: item.noteDocId,
        locatedBlock,
        rawItem: item,
    };
}

function buildSyncChangeViewsFromReport(report: WereadSyncReport): SyncChangeSummaryView[] {
    return (report.items || []).map((item) => {
        const sourceType = toManagedSourceType(item.sourceType);
        return {
            reportId: report.id,
            sourceKey: toReadingSourceKey(sourceType, item.bookID),
            bookID: item.bookID,
            title: item.title || item.bookID || "未命名来源",
            sourceType,
            status: item.status,
            statusLabel: getReportItemStatusLabel(item.status),
            addedItemCount: item.addedItemCount || 0,
            changedItemCount: item.changedItemCount || 0,
            deletedItemCount: item.deletedItemCount || 0,
            unchangedItemCount: item.unchangedItemCount || 0,
            blockOperationCount: item.blockOperationCount || 0,
            rebuilt: !!item.rebuilt,
            message: item.reasonText,
            suggestion: item.suggestion,
            noteDocId: item.noteDocId,
            startedAt: item.startedAt || report.startedAt,
            endedAt: item.endedAt || report.endedAt,
            details: [],
        };
    });
}

function buildBookHealthView(
    status: ReadingBookStatus,
    cache: any[],
    inboxItems: ReadingInboxItem[],
    latestReport: WereadSyncReport | null,
    blockIndex: WereadNoteUnitBlockIndex | null
): BookHealthView {
    const sourceType = toManagedSourceType(status.sourceType);
    const bookID = status.bookID || status.sourceKey.split(":").pop() || "";
    const sourceKey = status.sourceKey || toReadingSourceKey(sourceType, bookID);
    const blockSourceKey = normalizeSourceKeyForBlockIndex(sourceKey, status.sourceType, bookID);
    const cached = findCachedBook(cache, sourceType, bookID);
    const reportItem = findReportItem(latestReport, sourceType, bookID, sourceKey);
    const pendingInbox = inboxItems.filter(
        (item) => item.sourceKey === sourceKey && (item.status === "unprocessed" || item.status === "later")
    );
    const indexStatus = getIndexStatus(blockIndex?.sources?.[blockSourceKey]);
    const bound = !!status.noteDocId;
    const noteCount = getCachedNoteCount(cached);
    const bindingState = status.noteDocumentBindingState || (bound ? "bound" : "not_created");
    const reasons = buildHealthReasons(status, reportItem, bindingState, indexStatus, pendingInbox.length, sourceType, noteCount);
    const level = getHealthLevel(reasons);
    const title = status.title || cached?.title || bookID || "未命名来源";

    return {
        id: sourceKey,
        sourceKey,
        bookID,
        title,
        author: cached?.author || cached?.authorName,
        isbn: status.isbn || cached?.isbn || cached?.isbn13,
        sourceType,
        sourceLabel: sourceType === "mp" ? "公众号" : "普通书",
        level,
        levelLabel: getHealthLevelLabel(level),
        reasons,
        reasonLabels: reasons.map(getHealthReasonLabel),
        bound,
        noteDocId: status.noteDocId,
        indexStatus,
        indexStatusLabel: getIndexStatusLabel(indexStatus),
        lastSyncStatus: reportItem?.status || (status.syncFailed ? "failed" : undefined),
        lastSyncTime: reportItem?.endedAt || reportItem?.startedAt || status.lastSyncedAt,
        lastSyncMessage: reportItem?.reasonText || status.lastSyncError,
        inboxPendingCount: pendingInbox.length,
        addedItemCount: reportItem?.addedItemCount || 0,
        changedItemCount: reportItem?.changedItemCount || 0,
        deletedItemCount: reportItem?.deletedItemCount || 0,
        noteCount,
        recommendedAction: getRecommendedAction(reasons, sourceType),
    };
}

function mergeBookStatusesWithCache(statuses: ReadingBookStatus[], cache: any[]): ReadingBookStatus[] {
    const map = new Map<string, ReadingBookStatus>();
    const normalized = statuses.map((item) => normalizeReadingBookStatusSource(item, cache));
    for (const item of normalized) {
        if (!item.sourceKey) continue;
        map.set(item.sourceKey, item);
    }

    for (const book of cache || []) {
        const bookID = String(book.bookID || book.bookId || "").trim();
        if (!bookID) continue;
        const sourceType: ReadingManagementSourceType = toManagedSourceType(book.sourceType);
        const sourceKey = getWereadSourceKey(sourceType, bookID);
        const cachedCandidateId = String(book.localDocBlockID || book.localDocCandidateID || "").trim() || undefined;
        const existing = map.get(sourceKey);
        if (existing) {
            if (!existing.noteDocId && !existing.noteDocumentCandidateId && cachedCandidateId) {
                map.set(sourceKey, { ...existing, noteDocumentCandidateId: cachedCandidateId });
            }
        } else {
            map.set(sourceKey, {
                sourceKey,
                sourceType: sourceType === "mp" ? "weread-mp" : "weread-book",
                bookID,
                isbn: book.isbn || book.isbn13 || "",
                title: book.title || book.name || bookID,
                status: "not_started",
                updatedAt: Date.now(),
                noteDocumentCandidateId: cachedCandidateId,
            });
        }
    }

    return Array.from(map.values());
}

function buildHealthReasons(
    status: ReadingBookStatus,
    reportItem: WereadSyncReportItem | undefined,
    bindingState: NoteDocumentBindingState,
    indexStatus: BookIndexStatus,
    pendingInboxCount: number,
    sourceType: ReadingManagementSourceType,
    noteCount?: number
): BookHealthReason[] {
    const reasons: BookHealthReason[] = [];
    const hasSourceSyncHistory = !!reportItem || !!status.lastSyncedAt || !!status.syncFailed;
    if (bindingState === "bound") {
        reasons.push("bound");
    } else if (bindingState === "missing") {
        reasons.push("document_missing");
    } else if (bindingState === "invalid") {
        reasons.push("document_invalid");
    } else if (hasSourceSyncHistory && ((noteCount || 0) > 0 || status.hasNewNotes || pendingInboxCount > 0)) {
        reasons.push("unbound");
    }
    if (pendingInboxCount > 0 || status.hasNewNotes) reasons.push("has_new_notes");
    const syncFailed = status.syncFailed || reportItem?.status === "failed";
    if (syncFailed) reasons.push("sync_failed");
    if (reportItem?.status === "not_ready") reasons.push("not_ready");
    if (reportItem?.status === "skipped") reasons.push(sourceType === "mp" ? "mp_skipped" : "normal_book_skipped");
    if (indexStatus === "broken" && syncFailed) reasons.push("index_broken");
    return Array.from(new Set(reasons));
}

function getHealthLevel(reasons: BookHealthReason[]): BookHealthLevel {
    if (reasons.includes("sync_failed")) return "error";
    if (reasons.includes("document_missing") || reasons.includes("document_invalid")) return "warning";
    if (reasons.includes("unbound") || reasons.includes("has_new_notes")) {
        return "attention";
    }
    return "healthy";
}

function getIndexStatus(sourceIndex?: WereadSourceBlockIndex): BookIndexStatus {
    if (!sourceIndex) return "missing";
    if (!sourceIndex.docBlockID) return "broken";
    const items = Object.values(sourceIndex.items || {});
    if (items.length === 0) return "missing";
    const ids = new Set<string>();
    for (const item of items) {
        if (!item.itemId || !item.headBlockId || !item.tailBlockId || !item.blockIds?.length) return "broken";
        if (ids.has(item.itemId)) return "broken";
        ids.add(item.itemId);
    }
    return "ok";
}

function findCachedBook(cache: any[], sourceType: ReadingManagementSourceType, bookID: string): any {
    return (cache || []).find((book) => {
        const cachedBookID = String(book.bookID || book.bookId || "").trim();
        if (cachedBookID !== bookID) return false;
        return toManagedSourceType(book.sourceType) === sourceType;
    });
}

function findReportItem(
    report: WereadSyncReport | null,
    sourceType: ReadingManagementSourceType,
    bookID: string,
    sourceKey: string
): WereadSyncReportItem | undefined {
    return report?.items?.find((item) => {
        if (item.sourceKey && (item.sourceKey === sourceKey || item.sourceKey === toBlockSourceKey(sourceType, bookID))) return true;
        return item.bookID === bookID && toManagedSourceType(item.sourceType) === sourceType;
    });
}

function selectReport(reports: WereadSyncReport[], reportId?: string): WereadSyncReport | null {
    if (reportId) return reports.find((report) => report.id === reportId) || null;
    return [...reports].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0] || null;
}

function summarizeReportItems(items: WereadSyncReportItem[]): {
    added: number;
    changed: number;
    deleted: number;
    unchanged: number;
    blockOperations: number;
    rebuilt: number;
} {
    return items.reduce(
        (acc, item) => {
            acc.added += item.addedItemCount || 0;
            acc.changed += item.changedItemCount || 0;
            acc.deleted += item.deletedItemCount || 0;
            acc.unchanged += item.unchangedItemCount || 0;
            acc.blockOperations += item.blockOperationCount || 0;
            acc.rebuilt += item.rebuilt ? 1 : 0;
            return acc;
        },
        { added: 0, changed: 0, deleted: 0, unchanged: 0, blockOperations: 0, rebuilt: 0 }
    );
}

function filterSyncChange(item: SyncChangeSummaryView, filter: NonNullable<SyncChangeOptions["filter"]>): boolean {
    if (filter === "all") return true;
    if (filter === "added") return item.addedItemCount > 0;
    if (filter === "changed") return item.changedItemCount > 0;
    if (filter === "deleted") return item.deletedItemCount > 0;
    if (filter === "problem") return item.status !== "success";
    if (filter === "rebuilt") return item.rebuilt;
    if (filter === "skipped") return item.status === "skipped";
    if (filter === "book") return item.sourceType === "book";
    if (filter === "mp") return item.sourceType === "mp";
    return true;
}

function filterBookHealth(item: BookHealthView, filter: NonNullable<BookHealthOptions["filter"]>): boolean {
    if (filter === "all") return true;
    if (filter === "healthy") return item.level === "healthy";
    if (filter === "new") return item.inboxPendingCount > 0;
    if (filter === "unbound") return !item.bound;
    if (filter === "failed") return item.reasons.includes("sync_failed");
    if (filter === "indexMissing") return item.indexStatus === "missing";
    if (filter === "indexBroken") return item.indexStatus === "broken";
    if (filter === "book") return item.sourceType === "book";
    if (filter === "mp") return item.sourceType === "mp";
    return true;
}

function sortRecentNoteViews(views: RecentNoteView[], sortBy: NonNullable<RecentNoteOptions["sortBy"]>): RecentNoteView[] {
    return [...views].sort((a, b) => {
        if (sortBy === "title") return a.title.localeCompare(b.title, "zh-CN");
        if (sortBy === "status") return a.status.localeCompare(b.status);
        return (b.syncedAt || b.createdAt || 0) - (a.syncedAt || a.createdAt || 0);
    });
}

function getInboxStatusLabel(status: ReadingInboxStatus): string {
    const map: Record<ReadingInboxStatus, string> = {
        unprocessed: "未处理",
        later: "稍后",
        processed: "已处理",
        ignored: "已忽略",
    };
    return map[status] || status;
}

function getReportStatusLabel(status: string): string {
    const map: Record<string, string> = {
        success: "成功",
        partial: "部分成功",
        partial_success: "部分成功",
        failed: "失败",
        running: "进行中",
        cancelled: "已取消",
    };
    return map[status] || status;
}

function getReportItemStatusLabel(status: string): string {
    const map: Record<string, string> = {
        success: "成功",
        failed: "失败",
        skipped: "跳过",
        new_source: "新来源",
        not_ready: "未就绪",
        warning: "警告",
    };
    return map[status] || status;
}

function getHealthLevelLabel(level: BookHealthLevel): string {
    const map: Record<BookHealthLevel, string> = {
        healthy: "健康",
        attention: "待处理",
        warning: "需检查",
        error: "异常",
    };
    return map[level];
}

function getHealthReasonLabel(reason: BookHealthReason): string {
    const map: Record<BookHealthReason, string> = {
        bound: "已绑定本地笔记",
        unbound: "未绑定本地笔记",
        document_missing: "绑定的笔记文档已不存在",
        document_invalid: "绑定目标不是有效文档",
        has_new_notes: "有新增笔记待处理",
        sync_failed: "最近同步失败",
        index_missing: "还没有建立块级索引",
        index_broken: "块级索引可能失效",
        template_changed: "模板可能变化",
        not_ready: "本地文档未就绪",
        ignored: "已忽略",
        mp_skipped: "公众号本次跳过",
        normal_book_skipped: "普通书本次跳过",
    };
    return map[reason] || reason;
}

function getIndexStatusLabel(status: BookIndexStatus): string {
    const map: Record<BookIndexStatus, string> = {
        ok: "已建立",
        missing: "未建立",
        broken: "可能损坏",
        unknown: "未知",
    };
    return map[status];
}

function getRecommendedAction(reasons: BookHealthReason[], sourceType: ReadingManagementSourceType): string {
    if (reasons.includes("sync_failed")) return "查看同步报告，确认失败原因后重新同步。";
    if (reasons.includes("document_missing") || reasons.includes("document_invalid")) return "打开书架检查并重新建立笔记文档绑定。";
    if (reasons.includes("unbound")) return sourceType === "mp" ? "导入公众号或先忽略该来源。" : "打开书架或搜索添加，确认后再绑定。";
    if (reasons.includes("has_new_notes")) return "进入新增笔记收件箱处理。";
    if (reasons.includes("index_broken")) return "这本书的块级索引可能失效，建议重新同步一次。";
    if (reasons.includes("index_missing")) return "下次同步后会建立块级索引。";
    return "无需处理。";
}

function getCachedNoteCount(cached: any): number | undefined {
    if (!cached) return undefined;
    if (typeof cached.totalNoteCount === "number") return cached.totalNoteCount;
    const noteCount = typeof cached.noteCount === "number" ? cached.noteCount : 0;
    const reviewCount = typeof cached.reviewCount === "number" ? cached.reviewCount : 0;
    const bookmarkCount = typeof cached.bookmarkCount === "number" ? cached.bookmarkCount : 0;
    const total = noteCount + reviewCount + bookmarkCount;
    return total || undefined;
}

function truncateText(text: string | undefined, maxLen: number): string {
    const normalized = String(text || "").replace(/[\r\n]+/g, " ").trim();
    return normalized.length > maxLen ? `${normalized.slice(0, maxLen)}...` : normalized;
}

function formatLocalDateTime(ts?: number): string {
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
