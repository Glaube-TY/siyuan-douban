import type { ReadingInboxItem } from "../../types/readingInbox";
import { createReadingId, getReadingInboxItems, getWereadSourceKey, getWereadSourceSnapshots, saveReadingInboxItems, saveWereadSourceSnapshots, upsertReadingBookStatus } from "./readingStorage";

type PluginLike = {
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<void>;
};

interface NormalBookBookmark {
    bookmarkId?: string;
    bookId?: string;
    chapterTitle?: string;
    chapterName?: string;
    markText?: string;
    createTime?: number;
    range?: string;
}

interface NormalBookReview {
    reviewId?: string;
    bookId?: string;
    chapterTitle?: string;
    chapterName?: string;
    content?: string;
    abstract?: string;
    createTime?: number;
    range?: string;
}

interface MpArticleUnit {
    articleID: string;
    articleTitle: string;
    articleCreateTime?: number;
    notes: Array<{
        noteType: "highlight" | "comment_only";
        range: string;
        highlightText: string;
        highlightComment?: string;
        createTime?: number;
        comments?: Array<{ content: string; createTime?: number }>;
    }>;
}

export interface InboxDiffResult {
    newBookmarkCount: number;
    newReviewCount: number;
    newItems: ReadingInboxItem[];
}

export async function recordNormalBookInboxDiff(
    plugin: PluginLike,
    input: {
        bookID: string;
        title: string;
        noteDocId?: string;
        bookmarks: NormalBookBookmark[];
        reviews: NormalBookReview[];
    }
): Promise<InboxDiffResult> {
    const sourceKey = getWereadSourceKey("book", input.bookID);
    const snapshots = await getWereadSourceSnapshots(plugin);
    const previous = snapshots.find((item) => item.sourceKey === sourceKey);
    const previousBookmarkIds = new Set(previous?.bookmarkIds || []);
    const previousReviewIds = new Set(previous?.reviewIds || []);

    const currentBookmarkIds = input.bookmarks.map((item) => item.bookmarkId || createReadingId("bookmark", [input.bookID, item.range, item.markText, item.createTime]));
    const currentReviewIds = input.reviews.map((item) => item.reviewId || createReadingId("review", [input.bookID, item.range, item.content, item.createTime]));

    const shouldCreateItems = !!previous;
    const createdAt = Date.now();
    const newItems: ReadingInboxItem[] = [];

    if (shouldCreateItems) {
        input.bookmarks.forEach((bookmark, index) => {
            const originalId = currentBookmarkIds[index];
            if (!originalId || previousBookmarkIds.has(originalId)) return;
            newItems.push({
                id: createReadingId("inbox", [sourceKey, "bookmark", originalId]),
                sourceKey,
                sourceType: "weread-book",
                bookID: input.bookID,
                title: input.title,
                chapterTitle: bookmark.chapterTitle || bookmark.chapterName || "",
                content: bookmark.markText || "",
                itemType: "bookmark",
                originalId,
                noteDocId: input.noteDocId,
                createdAt,
                status: "unprocessed",
            });
        });

        input.reviews.forEach((review, index) => {
            const originalId = currentReviewIds[index];
            if (!originalId || previousReviewIds.has(originalId)) return;
            newItems.push({
                id: createReadingId("inbox", [sourceKey, "review", originalId]),
                sourceKey,
                sourceType: "weread-book",
                bookID: input.bookID,
                title: input.title,
                chapterTitle: review.chapterTitle || review.chapterName || "",
                content: review.abstract || "",
                reviewContent: review.content || "",
                itemType: "review",
                originalId,
                noteDocId: input.noteDocId,
                createdAt,
                status: "unprocessed",
            });
        });
    }

    await mergeInboxItems(plugin, newItems);
    await upsertSnapshot(plugin, {
        sourceKey,
        sourceType: "book",
        bookID: input.bookID,
        title: input.title,
        bookmarkIds: currentBookmarkIds,
        reviewIds: currentReviewIds,
        updatedAt: createdAt,
    });
    await upsertReadingBookStatus(plugin, {
        sourceKey,
        sourceType: "weread-book",
        bookID: input.bookID,
        title: input.title,
        noteDocId: input.noteDocId,
        lastSyncedAt: createdAt,
        hasNewNotes: newItems.length > 0 ? true : undefined,
        lastNewNoteCount: newItems.length > 0 ? newItems.length : undefined,
        syncFailed: false,
        lastSyncError: "",
    });

    return {
        newBookmarkCount: newItems.filter((item) => item.itemType === "bookmark").length,
        newReviewCount: newItems.filter((item) => item.itemType === "review").length,
        newItems,
    };
}

export async function recordMpAccountInboxDiff(
    plugin: PluginLike,
    input: {
        bookID: string;
        title: string;
        noteDocId?: string;
        articleUnits: MpArticleUnit[];
    }
): Promise<InboxDiffResult> {
    const sourceKey = getWereadSourceKey("mp", input.bookID);
    const snapshots = await getWereadSourceSnapshots(plugin);
    const previous = snapshots.find((item) => item.sourceKey === sourceKey);
    const previousBookmarkIds = new Set(previous?.bookmarkIds || []);
    const previousReviewIds = new Set(previous?.reviewIds || []);

    const bookmarkRecords: Array<{ originalId: string; unit: MpArticleUnit; note: MpArticleUnit["notes"][number] }> = [];
    const reviewRecords: Array<{ originalId: string; unit: MpArticleUnit; note: MpArticleUnit["notes"][number]; content: string; createTime?: number }> = [];

    for (const unit of input.articleUnits) {
        for (const note of unit.notes || []) {
            if (note.noteType === "highlight" && note.highlightText) {
                bookmarkRecords.push({
                    originalId: createReadingId("mp_bookmark", [unit.articleID, note.range, note.highlightText, note.createTime]),
                    unit,
                    note,
                });
            }
            for (const comment of note.comments || []) {
                if (!comment.content) continue;
                reviewRecords.push({
                    originalId: createReadingId("mp_review", [unit.articleID, note.range, comment.content, comment.createTime]),
                    unit,
                    note,
                    content: comment.content,
                    createTime: comment.createTime,
                });
            }
        }
    }

    const shouldCreateItems = !!previous;
    const createdAt = Date.now();
    const newItems: ReadingInboxItem[] = [];

    if (shouldCreateItems) {
        for (const record of bookmarkRecords) {
            if (previousBookmarkIds.has(record.originalId)) continue;
            newItems.push({
                id: createReadingId("inbox", [sourceKey, "mp-bookmark", record.originalId]),
                sourceKey,
                sourceType: "weread-mp",
                bookID: input.bookID,
                title: input.title,
                articleTitle: record.unit.articleTitle,
                content: record.note.highlightText || "",
                reviewContent: record.note.highlightComment || "",
                itemType: "bookmark",
                originalId: record.originalId,
                noteDocId: input.noteDocId,
                createdAt,
                status: "unprocessed",
            });
        }

        for (const record of reviewRecords) {
            if (previousReviewIds.has(record.originalId)) continue;
            newItems.push({
                id: createReadingId("inbox", [sourceKey, "mp-review", record.originalId]),
                sourceKey,
                sourceType: "weread-mp",
                bookID: input.bookID,
                title: input.title,
                articleTitle: record.unit.articleTitle,
                content: record.note.highlightText || "",
                reviewContent: record.content,
                itemType: "review",
                originalId: record.originalId,
                noteDocId: input.noteDocId,
                createdAt,
                status: "unprocessed",
            });
        }
    }

    await mergeInboxItems(plugin, newItems);
    await upsertSnapshot(plugin, {
        sourceKey,
        sourceType: "mp",
        bookID: input.bookID,
        title: input.title,
        bookmarkIds: bookmarkRecords.map((item) => item.originalId),
        reviewIds: reviewRecords.map((item) => item.originalId),
        articleIds: input.articleUnits.map((unit) => unit.articleID).filter(Boolean),
        updatedAt: createdAt,
    });
    await upsertReadingBookStatus(plugin, {
        sourceKey,
        sourceType: "weread-mp",
        bookID: input.bookID,
        title: input.title,
        noteDocId: input.noteDocId,
        lastSyncedAt: createdAt,
        hasNewNotes: newItems.length > 0 ? true : undefined,
        lastNewNoteCount: newItems.length > 0 ? newItems.length : undefined,
        syncFailed: false,
        lastSyncError: "",
    });

    return {
        newBookmarkCount: newItems.filter((item) => item.itemType === "bookmark").length,
        newReviewCount: newItems.filter((item) => item.itemType === "review").length,
        newItems,
    };
}

async function mergeInboxItems(plugin: PluginLike, newItems: ReadingInboxItem[]): Promise<void> {
    if (newItems.length === 0) return;
    const existing = await getReadingInboxItems(plugin);
    const map = new Map<string, ReadingInboxItem>();
    for (const item of existing) {
        map.set(item.id, item);
    }
    for (const item of newItems) {
        if (!map.has(item.id)) {
            map.set(item.id, item);
        }
    }
    await saveReadingInboxItems(plugin, Array.from(map.values()));
}

async function upsertSnapshot(plugin: PluginLike, snapshot: Awaited<ReturnType<typeof getWereadSourceSnapshots>>[number]): Promise<void> {
    const snapshots = await getWereadSourceSnapshots(plugin);
    const next = snapshots.filter((item) => item.sourceKey !== snapshot.sourceKey);
    next.push(snapshot);
    await saveWereadSourceSnapshots(plugin, next);
}

