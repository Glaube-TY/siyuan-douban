import type { ReadingInboxItem, ReadingInboxItemType, ReadingInboxStatus } from "../../types/readingInbox";
import type { WereadSyncReportItemStatus, WereadSyncReportStatus } from "../../types/syncReport";
import type { WereadRenderItemKind } from "../weread/incremental/types";
import type { NoteDocumentBindingState } from "./noteDocumentBinding";

export type ReadingManagementSourceType = "book" | "mp";

export interface LocatedBlock {
    itemId: string;
    sourceKey: string;
    sourceType: ReadingManagementSourceType;
    itemKind: WereadRenderItemKind;
    blockIds: string[];
    headBlockId?: string;
    tailBlockId?: string;
    docBlockID?: string;
}

export type BookHealthLevel = "healthy" | "attention" | "warning" | "error";

export type BookHealthReason =
    | "bound"
    | "unbound"
    | "document_missing"
    | "document_invalid"
    | "has_new_notes"
    | "sync_failed"
    | "index_missing"
    | "index_broken"
    | "template_changed"
    | "not_ready"
    | "ignored"
    | "mp_skipped"
    | "normal_book_skipped";

export type BookIndexStatus = "ok" | "missing" | "broken" | "unknown";

export interface ReadingManagementSummary {
    inboxPendingCount: number;
    inboxLaterCount: number;
    inboxProcessedCount: number;

    latestAddedItemCount: number;
    latestChangedItemCount: number;
    latestDeletedItemCount: number;
    latestBlockChangeCount: number;
    latestBlockOperationCount: number;
    latestRebuiltCount: number;

    unboundBookCount: number;
    syncProblemCount: number;
    healthyBookCount: number;
    warningBookCount: number;
    errorBookCount: number;

    lastSyncTime?: number;
    lastSyncStatus?: WereadSyncReportStatus | "unknown";
    latestSuccessCount: number;
    latestFailedCount: number;
    latestSkippedCount: number;
    pendingContentCount: number;
    actionableIssueCount: number;
}

export interface RecentNoteView {
    id: string;
    sourceKey: string;
    sourceType: ReadingManagementSourceType;
    readingSourceType: ReadingInboxItem["sourceType"];
    bookID?: string;
    title: string;
    chapterTitle?: string;
    articleTitle?: string;
    itemType: ReadingInboxItemType;
    typeLabel: "划线" | "评论" | "公众号";
    content: string;
    comment?: string;
    summary: string;
    sectionLabel: string;
    createdAt?: number;
    syncedAt?: number;
    createdAtText: string;
    discoveredAtText: string;
    status: ReadingInboxStatus;
    statusLabel: string;
    blockIndexed: boolean;
    blockStatusLabel: string;
    headBlockId?: string;
    tailBlockId?: string;
    itemId?: string;
    noteDocId?: string;
    locatedBlock?: LocatedBlock | null;
    rawItem: ReadingInboxItem;
}

export type SyncOutcomeIssueCode =
    | "unbound_with_notes"
    | "document_missing"
    | "document_invalid"
    | "sync_failed"
    | "index_broken";

export type SyncOutcomeIssueAction =
    | "open_shelf"
    | "open_records"
    | "open_diagnostics";

export interface SyncOutcomeIssue {
    id: string;
    sourceKey: string;
    sourceType: ReadingManagementSourceType;
    bookID?: string;
    title: string;
    issueCode: SyncOutcomeIssueCode;
    reason: string;
    action: SyncOutcomeIssueAction;
    actionLabel: string;
    noteDocumentBindingState: NoteDocumentBindingState;
    noteDocId?: string;
}

export interface SyncOutcomeNewContentGroup {
    sourceKey: string;
    sourceType: ReadingManagementSourceType;
    bookID?: string;
    title: string;
    totalCount: number;
    bookmarkCount: number;
    reviewCount: number;
    mpArticleCount: number;
    latestDiscoveredAt?: number;
    latestDiscoveredAtText: string;
    noteDocId?: string;
    noteDocumentBindingState: NoteDocumentBindingState;
    items: RecentNoteView[];
}

export interface SyncOutcomeRecord extends SyncChangeSummaryView {
    hasChanges: boolean;
    hasProblem: boolean;
    noteDocumentBindingState: NoteDocumentBindingState;
}

export interface SyncOutcomeData {
    latestReport: SyncChangeReportView | null;
    summary: ReadingManagementSummary;
    newContentGroups: SyncOutcomeNewContentGroup[];
    issues: SyncOutcomeIssue[];
    records: SyncOutcomeRecord[];
}

export interface SyncChangeDetailItem {
    type: "added" | "changed" | "deleted" | "rebuilt";
    title: string;
    summary?: string;
    chapterTitle?: string;
    articleTitle?: string;
    itemId?: string;
    headBlockId?: string;
}

export interface SyncChangeSummaryView {
    reportId: string;
    sourceKey: string;
    bookID?: string;
    title: string;
    sourceType: ReadingManagementSourceType;
    status: WereadSyncReportItemStatus;
    statusLabel: string;
    addedItemCount: number;
    changedItemCount: number;
    deletedItemCount: number;
    unchangedItemCount: number;
    blockOperationCount: number;
    rebuilt: boolean;
    message?: string;
    suggestion?: string;
    noteDocId?: string;
    startedAt?: number;
    endedAt?: number;
    details: SyncChangeDetailItem[];
}

export interface SyncChangeReportView {
    reportId: string;
    startedAt: number;
    endedAt?: number;
    status: WereadSyncReportStatus;
    statusLabel: string;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    addedItemCount: number;
    changedItemCount: number;
    deletedItemCount: number;
    unchangedItemCount: number;
    blockOperationCount: number;
    rebuiltCount: number;
    items: SyncChangeSummaryView[];
}

export interface BookHealthView {
    id: string;
    sourceKey: string;
    bookID?: string;
    title: string;
    author?: string;
    isbn?: string;
    sourceType: ReadingManagementSourceType;
    sourceLabel: string;
    level: BookHealthLevel;
    levelLabel: string;
    reasons: BookHealthReason[];
    reasonLabels: string[];
    bound: boolean;
    noteDocId?: string;
    indexStatus: BookIndexStatus;
    indexStatusLabel: string;
    lastSyncStatus?: string;
    lastSyncTime?: number;
    lastSyncMessage?: string;
    inboxPendingCount: number;
    addedItemCount: number;
    changedItemCount: number;
    deletedItemCount: number;
    noteCount?: number;
    recommendedAction: string;
}

export interface CacheStatusView {
    temporaryWereadNotebookCount: number;
    wereadNotebookRecordCount: number;
    readingInboxItemCount: number;
    readingBookStatusCount: number;
    wereadSyncReportCount: number;
    blockIndexSourceCount: number;
    latestSyncTime?: number;
    apiKeyEncrypted: boolean;
    apiKeyPlainResidual: boolean;
}

export interface DiagnosticSummary {
    pluginVersion: string;
    generatedAt: number;
    cacheStatus: CacheStatusView;
    latestReport?: {
        id: string;
        status: string;
        startedAt: number;
        endedAt?: number;
        successCount: number;
        failedCount: number;
        skippedCount: number;
        warnings: string[];
        errors: string[];
    };
    recentProblems: string[];
}
