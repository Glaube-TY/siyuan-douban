import type { ReadingInboxItem, ReadingInboxStatus } from "../../types/readingInbox";
import type { ReadingBookStatus } from "../../types/readingStatus";
import type { WereadSyncReport, WereadSyncReportItem } from "../../types/syncReport";
import {
    getWereadSourceKey,
    normalizeReadingBookStatusSource,
} from "../storage/readingStorage";
import {
    loadLatestWereadSyncReportStrict,
    loadNotebookCacheStrict,
    loadReadingBookStatusesStrict,
    loadReadingInboxItemsStrict,
    loadWereadNoteUnitBlockIndexStrict,
} from "./managementStorage";
import type { WereadNoteUnitBlockIndex, WereadSourceBlockIndex } from "../weread/incremental/types";
import {
    locateInboxItemBlock,
    normalizeSourceKeyForBlockIndex,
    toBlockSourceKey,
    toManagedSourceType,
    toReadingSourceKey,
} from "./blockLocator";
import type {
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
} from "./noteDocumentBinding";

export async function buildReadingManagementSummary(plugin: any): Promise<ReadingManagementSummary> {
    return (await buildSyncOutcomeData(plugin)).summary;
}

export async function buildSyncOutcomeData(plugin: any): Promise<SyncOutcomeData> {
    const [inboxItems, rawStatuses, cache, latestReport, blockIndex] = await Promise.all([
        loadReadingInboxItemsStrict(plugin),
        loadReadingBookStatusesStrict(plugin),
        loadNotebookCacheStrict(plugin),
        loadLatestWereadSyncReportStrict(plugin),
        loadWereadNoteUnitBlockIndexStrict(plugin),
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
