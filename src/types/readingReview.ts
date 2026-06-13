export type ReadingReviewItemStatus = "active" | "done" | "ignored";

export interface ReadingReviewItem {
    id: string;
    inboxItemId?: string;
    sourceKey: string;
    content: string;
    title: string;
    noteDocId?: string;
    nextReviewAt: number;
    lastReviewAt?: number;
    reviewCount: number;
    status: ReadingReviewItemStatus;
}

