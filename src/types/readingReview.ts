import type { ReadingInboxItemType } from "./readingInbox";
import type { ReadingSourceType } from "./readingStatus";

export type ReadingReviewItemStatus = "active" | "done" | "ignored";
export type ReadingReviewRating = "forgot" | "fuzzy" | "remembered";

export interface ReadingReviewItem {
    id: string;
    inboxItemId?: string;
    sourceKey: string;
    addedAt?: number;
    bookID?: string;
    sourceType?: ReadingSourceType;
    itemType?: ReadingInboxItemType;
    content: string;
    title: string;
    comment?: string;
    sectionLabel?: string;
    noteDocId?: string;
    blockId?: string;
    nextReviewAt: number;
    lastReviewAt?: number;
    reviewCount: number;
    reviewStage?: number;
    lastRating?: ReadingReviewRating;
    lastIntervalDays?: number;
    status: ReadingReviewItemStatus;
}

