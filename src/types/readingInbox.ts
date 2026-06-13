import type { ReadingSourceType } from "./readingStatus";

export type ReadingInboxItemType = "bookmark" | "review" | "mp_article";
export type ReadingInboxStatus = "unprocessed" | "processed" | "ignored" | "later";

export interface WereadSourceSnapshot {
    sourceKey: string;
    sourceType: "book" | "mp";
    bookID: string;
    title: string;
    bookmarkIds: string[];
    reviewIds: string[];
    articleIds?: string[];
    updatedAt: number;
}

export interface ReadingInboxItem {
    id: string;
    sourceKey: string;
    sourceType: ReadingSourceType;
    bookID: string;
    title: string;
    chapterTitle?: string;
    articleTitle?: string;
    content: string;
    reviewContent?: string;
    itemType: ReadingInboxItemType;
    originalId: string;
    noteDocId?: string;
    createdAt: number;
    status: ReadingInboxStatus;
}

