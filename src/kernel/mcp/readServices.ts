import type { ReadingAnnotation, ReadingAnnotationArchive } from "../../types/readingAnnotation";
import type { ReadingInboxItem, ReadingInboxStatus } from "../../types/readingInbox";
import type { ReadingReviewItem } from "../../types/readingReview";
import type { ReadingBookReviewStatus, ReadingBookStatus, ReadingSourceType } from "../../types/readingStatus";
import type { ReadingTopic, ReadingTopicItem } from "../../types/readingTopic";
import type {
    WereadSyncReport,
    WereadSyncReportItem,
    WereadSyncReportItemStatus,
    WereadSyncReportStatus,
} from "../../types/syncReport";
import { countNotebookNotes } from "../../utils/readingCenter/readingCenterData";
import {
    getReadingReviewIntervalPreview,
    loadReadingReviewItemsStrict,
} from "../../utils/readingCenter/readingReviewService";
import { loadReadingTopicsForPicker } from "../../utils/readingCenter/readingTopicService";
import {
    loadReadingBookStatusesStrict,
    loadReadingInboxItemsStrict,
    loadWereadAuthSettingsStrict,
    loadWereadSyncReportsStrict,
} from "../../utils/readingManagement/managementStorage";
import { buildDiagnosticSummary } from "../../utils/readingManagement/maintenanceActions";
import { loadReadingAnnotationArchiveState } from "../../utils/storage/readingAnnotationStorage";
import {
    loadPluginStorageJsonStateStrict,
    type PluginLike,
} from "../../utils/storage/pluginStorageStrict";
import { STORAGE_KEYS } from "../../utils/storage/readingStorage";
import type { KernelPluginStorageAdapter } from "../storage/kernelPluginStorageAdapter";

type ReadPlugin = PluginLike & {
    version: string;
    loadData: (storageName: string) => Promise<any>;
    saveData: (storageName: string, value: any) => Promise<void>;
};

const NOTEBOOK_CACHE_KEY = "temporary_weread_notebooksList";
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const DEFAULT_REPORT_LIMIT = 5;
const MAX_REPORT_LIMIT = 20;
const DEFAULT_PROBLEM_LIMIT = 10;
const MAX_PROBLEM_LIMIT = 20;

const READING_BOOK_STATUSES: ReadingBookReviewStatus[] = [
    "not_started",
    "reading",
    "finished",
    "to_review",
    "reviewing",
    "reviewed",
    "archived",
];
const READING_SOURCE_TYPES: ReadingSourceType[] = ["weread-book", "weread-mp", "local-book"];
const INBOX_STATUSES: ReadingInboxStatus[] = ["unprocessed", "processed", "ignored", "later"];
const REPORT_STATUSES: WereadSyncReportStatus[] = [
    "success",
    "partial",
    "partial_success",
    "failed",
    "running",
    "cancelled",
];
const REPORT_ITEM_STATUSES: WereadSyncReportItemStatus[] = [
    "success",
    "failed",
    "skipped",
    "new_source",
    "not_ready",
    "warning",
];
const REPORT_TRIGGERS: WereadSyncReport["trigger"][] = ["manual", "auto", "update", "test", "background"];
const SENSITIVE_TEXT = /(api[_ -]?key|apikeyencrypted|crypto[_ -]?key|authorization|bearer|access[_ -]?token|refresh[_ -]?token|password|secret)/i;

export async function readReadingOverview(plugin: ReadPlugin): Promise<Record<string, unknown>> {
    const [notebooks, statuses, inbox, reviews, topics, reports, annotations] = await Promise.all([
        loadStrictArrayState<any>(plugin, NOTEBOOK_CACHE_KEY),
        loadStrictArrayState<ReadingBookStatus>(plugin, STORAGE_KEYS.bookStatuses),
        loadStrictArrayState<ReadingInboxItem>(plugin, STORAGE_KEYS.inboxItems),
        loadStrictArrayState<ReadingReviewItem>(plugin, STORAGE_KEYS.reviewItems),
        loadStrictArrayState<ReadingTopic>(plugin, STORAGE_KEYS.topics),
        loadStrictArrayState<unknown>(plugin, STORAGE_KEYS.syncReports),
        loadReadingAnnotationArchiveState(plugin),
    ]);
    const syncReports = reports.exists ? reports.value.map(validateSyncReport) : [];
    const latestReport = getLatestReport(syncReports);
    const now = Date.now();
    const reviewItems = reviews.value;
    const annotationCount = annotations.exists
        ? Object.values(annotations.archive.sources).reduce((sum, source) => sum + source.annotations.length, 0)
        : 0;

    return {
        schemaVersion: 1,
        pluginVersion: plugin.version || "unknown",
        notebookCount: notebooks.value.length,
        noteCount: countNotebookNotes(notebooks.value),
        bookStatusCount: statuses.value.length,
        pendingInboxCount: inbox.value.filter((item) => item.status === "unprocessed").length,
        laterInboxCount: inbox.value.filter((item) => item.status === "later").length,
        activeReviewCount: reviewItems.filter((item) => item.status === "active").length,
        dueReviewCount: reviewItems.filter((item) => item.status === "active" && item.nextReviewAt <= now).length,
        topicCount: topics.value.length,
        annotationSourceCount: annotations.exists ? Object.keys(annotations.archive.sources).length : 0,
        annotationCount,
        latestSyncStatus: latestReport?.status ?? null,
        latestSyncTime: latestReport?.endedAt || latestReport?.startedAt || null,
        latestSyncSuccessCount: latestReport?.successCount ?? null,
        latestSyncFailedCount: latestReport?.failedCount ?? null,
        latestSyncSkippedCount: latestReport?.skippedCount ?? null,
        generatedAt: Date.now(),
        availability: {
            notebookCache: notebooks.exists,
            bookStatuses: statuses.exists,
            inbox: inbox.exists,
            reviewQueue: reviews.exists,
            topics: topics.exists,
            syncReports: reports.exists,
            annotationArchive: annotations.exists,
        },
    };
}

export async function readSyncStatus(plugin: ReadPlugin, input: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const problemLimit = normalizeLimit(input.problemLimit, DEFAULT_PROBLEM_LIMIT, MAX_PROBLEM_LIMIT);
    const reports = await loadSyncReports(plugin);
    const latestReport = getLatestReport(reports);
    const problems = (latestReport?.items || [])
        .filter((item) => item.status !== "success")
        .slice(0, problemLimit)
        .map(toSyncProblem);

    return {
        schemaVersion: 1,
        latestReport: latestReport ? toSyncReportHeader(latestReport) : null,
        problems,
        liveRuntimeObservable: false,
        liveState: latestReport ? "not_bridged" : "unavailable",
    };
}

export async function readSyncHistory(plugin: ReadPlugin, input: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const limit = normalizeLimit(input.limit, DEFAULT_REPORT_LIMIT, MAX_REPORT_LIMIT);
    const requestedStatus = normalizeEnum(input.status, REPORT_STATUSES, "status");
    const reports = await loadSyncReports(plugin);
    const filtered = stableNewest(requestedStatus
        ? reports.filter((report) => report.status === requestedStatus)
        : reports, (report) => report.startedAt);

    return {
        schemaVersion: 1,
        total: filtered.length,
        limit,
        items: filtered.slice(0, limit).map(toSyncReportSummary),
    };
}

export async function readReadingStatuses(plugin: ReadPlugin, input: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const limit = normalizeLimit(input.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const offset = normalizeOffset(input.offset);
    const requestedStatus = normalizeEnum(input.status, READING_BOOK_STATUSES, "status");
    const requestedSourceType = normalizeEnum(input.sourceType, READING_SOURCE_TYPES, "sourceType");
    const query = normalizeQuery(input.query);
    const statuses = await loadReadingBookStatusesStrict(plugin);
    const filtered = statuses.filter((item) => {
        if (requestedStatus && item.status !== requestedStatus) return false;
        if (requestedSourceType && item.sourceType !== requestedSourceType) return false;
        return !query || matchesQuery(query, item.title, item.bookID, item.sourceKey);
    });

    return {
        schemaVersion: 1,
        total: filtered.length,
        offset,
        limit,
        items: filtered.slice(offset, offset + limit).map(toReadingStatus),
    };
}

export async function readReadingInbox(plugin: ReadPlugin, input: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const limit = normalizeLimit(input.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const offset = normalizeOffset(input.offset);
    const requestedStatus = normalizeEnum(input.status, INBOX_STATUSES, "status");
    const sourceKey = normalizeQuery(input.sourceKey);
    const query = normalizeQuery(input.query);
    const inboxItems = await loadReadingInboxItemsStrict(plugin);
    const filtered = stableNewest(inboxItems.filter((item) => {
        if (requestedStatus && item.status !== requestedStatus) return false;
        if (sourceKey && item.sourceKey !== sourceKey) return false;
        return !query || matchesQuery(query, item.title, item.bookID, item.sourceKey);
    }), (item) => item.createdAt);

    return {
        schemaVersion: 1,
        total: filtered.length,
        offset,
        limit,
        items: filtered.slice(offset, offset + limit).map(toReadingInboxItem),
    };
}

export async function readReviewQueue(plugin: ReadPlugin, input: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const limit = normalizeLimit(input.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const offset = normalizeOffset(input.offset);
    const dueOnly = typeof input.dueOnly === "boolean" ? input.dueOnly : true;
    const sourceKey = normalizeQuery(input.sourceKey);
    const reviewItems = await loadReadingReviewItemsStrict(plugin);
    const scoped = sourceKey ? reviewItems.filter((item) => item.sourceKey === sourceKey) : reviewItems;
    const activeItems = scoped.filter((item) => item.status === "active");
    const dueItems = activeItems.filter((item) => item.nextReviewAt <= Date.now());
    const matched = dueOnly ? dueItems : scoped;

    return {
        schemaVersion: 1,
        dueOnly,
        activeCount: activeItems.length,
        dueCount: dueItems.length,
        dueSourceCount: new Set(dueItems.map((item) => item.sourceKey)).size,
        totalMatched: matched.length,
        offset,
        limit,
        items: matched.slice(offset, offset + limit).map(toReviewItem),
    };
}

export async function readReadingTopics(plugin: ReadPlugin, input: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const limit = normalizeLimit(input.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const offset = normalizeOffset(input.offset);
    const topicId = normalizeQuery(input.topicId);
    const includeItems = input.includeItems === true;
    const { topics, topicItems } = await loadReadingTopicsForPicker(plugin);
    const selectedTopic = topicId ? topics.find((topic) => topic.id === topicId) : undefined;
    if (topicId && !selectedTopic) {
        throw new Error(`Reading topic not found: ${topicId}`);
    }

    const availableTopics = selectedTopic ? [selectedTopic] : topics;
    const pagedTopics = selectedTopic ? availableTopics : availableTopics.slice(offset, offset + limit);
    return {
        schemaVersion: 1,
        total: availableTopics.length,
        offset,
        limit,
        topics: pagedTopics.map((topic) => {
            const items = topicItems.filter((item) => item.topicId === topic.id);
            return compactRecord({
                id: topic.id,
                name: topic.name,
                description: topic.description,
                color: topic.color,
                createdAt: topic.createdAt,
                updatedAt: topic.updatedAt,
                itemCount: items.length,
                items: includeItems ? items.slice(offset, offset + limit).map(toReadingTopicItem) : undefined,
            });
        }),
    };
}

export async function readReadingAnnotations(plugin: ReadPlugin, input: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const limit = normalizeLimit(input.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const offset = normalizeOffset(input.offset);
    const sourceKey = normalizeQuery(input.sourceKey);
    const bookID = normalizeQuery(input.bookID);
    const annotationType = normalizeEnum(input.annotationType, ["highlight", "review"] as const, "annotationType");
    const query = normalizeQuery(input.query);
    const state = await loadReadingAnnotationArchiveState(plugin);
    if (!state.exists) {
        return {
            schemaVersion: 1,
            available: false,
            annotationSourceCount: 0,
            totalMatched: 0,
            offset,
            limit,
            items: [],
        };
    }

    const annotations = flattenAnnotations(state.archive);
    const filtered = annotations.filter((annotation) => {
        if (sourceKey && annotation.sourceKey !== sourceKey) return false;
        if (bookID && annotation.bookID !== bookID) return false;
        if (annotationType && annotation.annotationType !== annotationType) return false;
        return !query || matchesQuery(
            query,
            annotation.title,
            annotation.content,
            annotation.quote,
            annotation.chapterTitle,
            annotation.articleTitle,
        );
    });

    return {
        schemaVersion: 1,
        available: true,
        annotationSourceCount: Object.keys(state.archive.sources).length,
        totalMatched: filtered.length,
        offset,
        limit,
        items: filtered.slice(offset, offset + limit).map(toReadingAnnotation),
    };
}

export async function readDiagnostics(
    plugin: KernelPluginStorageAdapter & ReadPlugin,
    input: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
    const problemLimit = normalizeLimit(input.problemLimit, DEFAULT_PROBLEM_LIMIT, MAX_PROBLEM_LIMIT);
    const [summary, authSettings] = await Promise.all([
        buildDiagnosticSummary(plugin),
        loadWereadAuthSettingsStrict(plugin),
    ]);
    const cacheStatus = summary.cacheStatus;
    const latestReport = summary.latestReport;

    return {
        schemaVersion: 1,
        pluginVersion: summary.pluginVersion,
        generatedAt: summary.generatedAt,
        cacheCounts: {
            temporaryWereadNotebookCount: cacheStatus.temporaryWereadNotebookCount,
            wereadNotebookRecordCount: cacheStatus.wereadNotebookRecordCount,
            readingInboxItemCount: cacheStatus.readingInboxItemCount,
            readingBookStatusCount: cacheStatus.readingBookStatusCount,
            wereadSyncReportCount: cacheStatus.wereadSyncReportCount,
        },
        indexedSourceCount: cacheStatus.blockIndexSourceCount,
        latestSync: latestReport
            ? {
                id: latestReport.id,
                status: latestReport.status,
                startedAt: latestReport.startedAt,
                endedAt: latestReport.endedAt,
                successCount: latestReport.successCount,
                failedCount: latestReport.failedCount,
                skippedCount: latestReport.skippedCount,
                warnings: latestReport.warnings.map(safeDiagnosticText),
                errors: latestReport.errors.map(safeDiagnosticText),
            }
            : null,
        recentProblems: summary.recentProblems.slice(0, problemLimit).map(safeDiagnosticText),
        authentication: {
            wereadApiConfigured: cacheStatus.apiKeyEncrypted || cacheStatus.apiKeyPlainResidual,
            encryptedCredentialPresent: cacheStatus.apiKeyEncrypted,
            plaintextCredentialResidualDetected: cacheStatus.apiKeyPlainResidual,
            verified: authSettings.verified === true,
            verifiedAt: finiteNumber(authSettings.verifiedAt),
        },
    };
}

async function loadStrictArrayState<T>(plugin: ReadPlugin, storageName: string): Promise<{ exists: boolean; value: T[] }> {
    const state = await loadPluginStorageJsonStateStrict(plugin, storageName);
    if (!state.exists) return { exists: false, value: [] };
    if (!Array.isArray(state.value)) {
        throw new Error(`插件存储格式无效：${storageName} 必须是数组`);
    }
    return { exists: true, value: state.value as T[] };
}

async function loadSyncReports(plugin: ReadPlugin): Promise<WereadSyncReport[]> {
    return (await loadWereadSyncReportsStrict(plugin)).map(validateSyncReport);
}

function validateSyncReport(value: unknown, index: number): WereadSyncReport {
    if (!isRecord(value)) throw new Error(`同步报告第 ${index + 1} 条记录格式无效`);
    requireString(value.id, `同步报告第 ${index + 1} 条记录 id`);
    requireFiniteNumber(value.startedAt, `同步报告第 ${index + 1} 条记录 startedAt`);
    requireEnum(value.trigger, REPORT_TRIGGERS, `同步报告第 ${index + 1} 条记录 trigger`);
    requireEnum(value.status, REPORT_STATUSES, `同步报告第 ${index + 1} 条记录 status`);
    requireCount(value.totalSources, `同步报告第 ${index + 1} 条记录 totalSources`);
    requireCount(value.successCount, `同步报告第 ${index + 1} 条记录 successCount`);
    requireCount(value.failedCount, `同步报告第 ${index + 1} 条记录 failedCount`);
    requireCount(value.skippedCount, `同步报告第 ${index + 1} 条记录 skippedCount`);
    requireCount(value.newSourceCount, `同步报告第 ${index + 1} 条记录 newSourceCount`);
    if (value.endedAt !== undefined) requireFiniteNumber(value.endedAt, `同步报告第 ${index + 1} 条记录 endedAt`);
    if (!Array.isArray(value.items)) throw new Error(`同步报告第 ${index + 1} 条记录 items 格式无效`);
    value.items.forEach((item, itemIndex) => validateSyncReportItem(item, index, itemIndex));
    requireStringArray(value.warnings, `同步报告第 ${index + 1} 条记录 warnings`);
    requireStringArray(value.errors, `同步报告第 ${index + 1} 条记录 errors`);
    return value as unknown as WereadSyncReport;
}

function validateSyncReportItem(value: unknown, reportIndex: number, itemIndex: number): WereadSyncReportItem {
    const label = `同步报告第 ${reportIndex + 1} 条记录的第 ${itemIndex + 1} 个来源`;
    if (!isRecord(value)) throw new Error(`${label}格式无效`);
    if (value.sourceKey !== undefined) requireString(value.sourceKey, `${label} sourceKey`);
    requireEnum(value.sourceType, ["book", "mp"] as const, `${label} sourceType`);
    requireString(value.bookID, `${label} bookID`);
    requireString(value.title, `${label} title`);
    requireEnum(value.status, REPORT_ITEM_STATUSES, `${label} status`);
    requireCount(value.newBookmarkCount, `${label} newBookmarkCount`);
    requireCount(value.newReviewCount, `${label} newReviewCount`);
    for (const key of ["addedItemCount", "changedItemCount", "deletedItemCount", "unchangedItemCount", "blockOperationCount"] as const) {
        if (value[key] !== undefined) requireCount(value[key], `${label} ${key}`);
    }
    for (const key of ["reasonCode", "reasonText", "noteDocId", "suggestion"] as const) {
        if (value[key] !== undefined) requireString(value[key], `${label} ${key}`);
    }
    for (const key of ["startedAt", "endedAt"] as const) {
        if (value[key] !== undefined) requireFiniteNumber(value[key], `${label} ${key}`);
    }
    if (value.rebuilt !== undefined && typeof value.rebuilt !== "boolean") {
        throw new Error(`${label} rebuilt 格式无效`);
    }
    return value as unknown as WereadSyncReportItem;
}

function getLatestReport(reports: WereadSyncReport[]): WereadSyncReport | null {
    return stableNewest(reports, (report) => report.startedAt)[0] || null;
}

function toSyncReportHeader(report: WereadSyncReport): Record<string, unknown> {
    return {
        id: report.id,
        trigger: report.trigger,
        status: report.status,
        startedAt: report.startedAt,
        endedAt: report.endedAt,
        totalSources: report.totalSources,
        successCount: report.successCount,
        failedCount: report.failedCount,
        skippedCount: report.skippedCount,
        newSourceCount: report.newSourceCount,
        warnings: report.warnings.map(safeDiagnosticText),
        errors: report.errors.map(safeDiagnosticText),
    };
}

function toSyncProblem(item: WereadSyncReportItem): Record<string, unknown> {
    return compactRecord({
        sourceKey: item.sourceKey,
        sourceType: item.sourceType,
        bookID: item.bookID,
        title: item.title,
        status: item.status,
        reasonCode: item.reasonCode,
        reasonText: item.reasonText === undefined ? undefined : safeDiagnosticText(item.reasonText),
        noteDocId: item.noteDocId,
        addedItemCount: item.addedItemCount,
        changedItemCount: item.changedItemCount,
        deletedItemCount: item.deletedItemCount,
        unchangedItemCount: item.unchangedItemCount,
        blockOperationCount: item.blockOperationCount,
        rebuilt: item.rebuilt,
    });
}

function toSyncReportSummary(report: WereadSyncReport): Record<string, unknown> {
    const stats = report.items.reduce((result, item) => {
        result.addedItemCount += item.addedItemCount || 0;
        result.changedItemCount += item.changedItemCount || 0;
        result.deletedItemCount += item.deletedItemCount || 0;
        result.unchangedItemCount += item.unchangedItemCount || 0;
        result.blockOperationCount += item.blockOperationCount || 0;
        result.rebuiltCount += item.rebuilt ? 1 : 0;
        return result;
    }, {
        addedItemCount: 0,
        changedItemCount: 0,
        deletedItemCount: 0,
        unchangedItemCount: 0,
        blockOperationCount: 0,
        rebuiltCount: 0,
    });
    return {
        id: report.id,
        trigger: report.trigger,
        status: report.status,
        startedAt: report.startedAt,
        endedAt: report.endedAt,
        totalSources: report.totalSources,
        successCount: report.successCount,
        failedCount: report.failedCount,
        skippedCount: report.skippedCount,
        newSourceCount: report.newSourceCount,
        warningCount: report.warnings.length,
        errorCount: report.errors.length,
        ...stats,
    };
}

function toReadingStatus(item: ReadingBookStatus): Record<string, unknown> {
    return compactRecord({
        sourceKey: item.sourceKey,
        sourceType: item.sourceType,
        bookID: item.bookID,
        isbn: item.isbn,
        title: item.title,
        status: item.status,
        updatedAt: item.updatedAt,
        noteDocId: item.noteDocId,
        noteDocumentBindingState: item.noteDocumentBindingState,
        lastSyncedAt: item.lastSyncedAt,
        hasNewNotes: item.hasNewNotes,
        lastNewNoteCount: item.lastNewNoteCount,
        syncFailed: item.syncFailed,
        lastSyncError: item.lastSyncError === undefined ? undefined : safeDiagnosticText(item.lastSyncError),
    });
}

function toReadingInboxItem(item: ReadingInboxItem): Record<string, unknown> {
    return compactRecord({
        id: item.id,
        sourceKey: item.sourceKey,
        sourceType: item.sourceType,
        bookID: item.bookID,
        title: item.title,
        itemType: item.itemType,
        content: item.content,
        reviewContent: item.reviewContent,
        chapterTitle: item.chapterTitle,
        articleTitle: item.articleTitle,
        noteDocId: item.noteDocId,
        originalId: item.originalId,
        createdAt: item.createdAt,
        status: item.status,
    });
}

function toReviewItem(item: ReadingReviewItem): Record<string, unknown> {
    return compactRecord({
        id: item.id,
        inboxItemId: item.inboxItemId,
        sourceKey: item.sourceKey,
        sourceType: item.sourceType,
        itemType: item.itemType,
        bookID: item.bookID,
        title: item.title,
        content: item.content,
        comment: item.comment,
        sectionLabel: item.sectionLabel,
        nextReviewAt: item.nextReviewAt,
        reviewCount: item.reviewCount,
        reviewStage: item.reviewStage,
        lastRating: item.lastRating,
        lastReviewAt: item.lastReviewAt,
        noteDocId: item.noteDocId,
        blockId: item.blockId,
        intervalPreview: getReadingReviewIntervalPreview(item),
    });
}

function toReadingTopicItem(item: ReadingTopicItem): Record<string, unknown> {
    return compactRecord({
        id: item.id,
        topicId: item.topicId,
        sourceType: item.sourceType,
        title: item.title,
        bookID: item.bookID,
        noteDocId: item.noteDocId,
        blockId: item.blockId,
        content: item.content,
        comment: item.comment,
        createdAt: item.createdAt,
    });
}

function toReadingAnnotation(annotation: ReadingAnnotation): Record<string, unknown> {
    return compactRecord({
        id: annotation.id,
        sourceKey: annotation.sourceKey,
        sourceType: annotation.sourceType,
        bookID: annotation.bookID,
        title: annotation.title,
        annotationType: annotation.annotationType,
        content: annotation.content,
        quote: annotation.quote,
        chapterTitle: annotation.chapterTitle,
        articleID: annotation.articleID,
        articleTitle: annotation.articleTitle,
        originalId: annotation.originalId,
        providerId: annotation.providerId,
        range: annotation.range,
        createdAt: annotation.createdAt,
        syncedAt: annotation.syncedAt,
        noteDocId: annotation.noteDocId,
        blockId: annotation.blockId,
        blockIds: annotation.blockIds,
    });
}

function flattenAnnotations(archive: ReadingAnnotationArchive): ReadingAnnotation[] {
    return Object.values(archive.sources).flatMap((source) => source.annotations);
}

function stableNewest<T>(items: T[], getTime: (item: T) => unknown): T[] {
    return items
        .map((item, index) => ({ item, index, time: finiteNumber(getTime(item)) }))
        .sort((left, right) => {
            if (left.time === undefined && right.time === undefined) return left.index - right.index;
            if (left.time === undefined) return 1;
            if (right.time === undefined) return -1;
            return right.time - left.time || left.index - right.index;
        })
        .map(({ item }) => item);
}

function normalizeLimit(value: unknown, fallback: number, maximum: number): number {
    const numeric = finiteNumber(value);
    if (numeric === undefined) return fallback;
    const integer = Math.trunc(numeric);
    if (integer < 1) return fallback;
    return Math.min(integer, maximum);
}

function normalizeOffset(value: unknown): number {
    const numeric = finiteNumber(value);
    if (numeric === undefined || numeric < 0) return 0;
    return Math.trunc(numeric);
}

function normalizeQuery(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function matchesQuery(query: string, ...values: unknown[]): boolean {
    const normalized = query.toLocaleLowerCase();
    return values.some((value) => String(value ?? "").toLocaleLowerCase().includes(normalized));
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], name: string): T | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    return requireEnum(value, allowed, name);
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
    if (typeof value !== "string" || !allowed.includes(value as T)) {
        throw new Error(`${name} 参数值无效`);
    }
    return value as T;
}

function finiteNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requireFiniteNumber(value: unknown, name: string): number {
    const number = finiteNumber(value);
    if (number === undefined || number < 0) throw new Error(`${name} 格式无效`);
    return number;
}

function requireCount(value: unknown, name: string): number {
    const number = requireFiniteNumber(value, name);
    if (!Number.isInteger(number)) throw new Error(`${name} 必须是整数`);
    return number;
}

function requireString(value: unknown, name: string): string {
    if (typeof value !== "string") throw new Error(`${name} 格式无效`);
    return value;
}

function requireStringArray(value: unknown, name: string): string[] {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new Error(`${name} 格式无效`);
    }
    return value as string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function safeDiagnosticText(value: unknown): string {
    const text = String(value ?? "");
    if (!text) return "";
    if (SENSITIVE_TEXT.test(text)) return "[sensitive detail omitted]";
    return text
        .replace(/(api[_ -]?key(?:encrypted)?["':=\s]+)([^\s,;]+)/gi, "$1***")
        .replace(/([?&]key=)([^&\s]+)/gi, "$1***")
        .replace(/(authorization["':=\s]+bearer\s+)([^\s,;]+)/gi, "$1***");
}
