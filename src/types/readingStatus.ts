export type ReadingSourceType = "weread-book" | "weread-mp" | "local-book";

export type ReadingBookReviewStatus =
    | "not_started"
    | "reading"
    | "finished"
    | "to_review"
    | "reviewing"
    | "reviewed"
    | "archived";

export interface ReadingBookStatus {
    sourceKey: string;
    sourceType: ReadingSourceType;
    bookID?: string;
    isbn?: string;
    title: string;
    status: ReadingBookReviewStatus;
    updatedAt: number;
    noteDocId?: string;
    lastSyncedAt?: number;
    hasNewNotes?: boolean;
    lastNewNoteCount?: number;
    syncFailed?: boolean;
    lastSyncError?: string;
}

export const READING_BOOK_STATUS_LABELS: Record<ReadingBookReviewStatus, string> = {
    not_started: "未开始",
    reading: "在读",
    finished: "已读完",
    to_review: "待整理",
    reviewing: "整理中",
    reviewed: "已整理",
    archived: "已归档",
};

