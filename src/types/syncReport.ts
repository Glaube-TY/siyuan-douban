/**
 * 同步诊断报告类型定义
 */

/** 同步报告单项状态 */
export type WereadSyncReportItemStatus = "success" | "failed" | "skipped" | "new_source" | "not_ready" | "warning";

/** 同步报告整体状态 */
export type WereadSyncReportStatus = "success" | "partial" | "partial_success" | "failed" | "running" | "cancelled";

/** 同步失败/跳过原因码 */
export type WereadSyncReportReasonCode =
    | "API_KEY_INVALID"
    | "API_REQUEST_FAILED"
    | "BOOK_INFO_EMPTY"
    | "BOOKMARK_LIST_EMPTY"
    | "REVIEW_LIST_EMPTY"
    | "TARGET_DOC_NOT_FOUND"
    | "TARGET_DOC_NOT_READY"
    | "WRITE_BLOCK_FAILED"
    | "SYNC_MARKER_MISSING_BUT_APPENDED"
    | "MP_TITLE_RESOLVE_FAILED"
    | "BOOK_SKIPPED_BY_USER"
    | "NEW_SOURCE_NOT_IMPORTED"
    | "BOOK_ID_IS_MISSING"
    | "ISBN_MATCH_FAILED"
    | "UNKNOWN_ERROR";

/** 同步报告单项（单本书/公众号） */
export interface WereadSyncReportItem {
    sourceKey?: string;
    sourceType: "book" | "mp";
    bookID: string;
    title: string;
    status: WereadSyncReportItemStatus;
    reasonCode?: WereadSyncReportReasonCode;
    reasonText?: string;
    noteDocId?: string;
    newBookmarkCount: number;
    newReviewCount: number;
    suggestion?: string;
    startedAt?: number;
    endedAt?: number;
}

/** 同步报告 */
export interface WereadSyncReport {
    id: string;
    startedAt: number;
    endedAt?: number;
    trigger: "manual" | "auto" | "update" | "test" | "background";
    status: WereadSyncReportStatus;
    totalSources: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    newSourceCount: number;
    items: WereadSyncReportItem[];
    warnings: string[];
    errors: string[];
}
