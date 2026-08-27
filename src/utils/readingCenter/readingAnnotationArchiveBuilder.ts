import type { ReadingAnnotation, ReadingAnnotationSourceArchive } from "../../types/readingAnnotation";
import { createReadingId } from "../storage/readingStorage";
import { locateIndexedSourceItemBlock } from "../readingManagement/blockLocator";
import type { WereadSourceBlockIndex } from "../weread/incremental/types";
import type { MpArticleSyncUnit } from "../weread/mpArticleSync";

interface NormalBookBookmark {
    bookmarkId?: string;
    chapterTitle?: string;
    chapterName?: string;
    markText?: string;
    createTime?: number;
    range?: string;
}

interface NormalBookReview {
    reviewId?: string;
    chapterTitle?: string;
    chapterName?: string;
    content?: string;
    abstract?: string;
    createTime?: number;
    range?: string;
}

export function buildNormalBookAnnotationSource(input: {
    bookID: string;
    title: string;
    noteDocId?: string;
    bookmarks: NormalBookBookmark[];
    reviews: NormalBookReview[];
    sourceIndex: WereadSourceBlockIndex;
    syncedAt: number;
}): ReadingAnnotationSourceArchive {
    const sourceKey = `weread-book:${input.bookID}`;
    const annotations: ReadingAnnotation[] = [];

    for (const bookmark of input.bookmarks || []) {
        const originalId = bookmark.bookmarkId || createReadingId("bookmark", [input.bookID, bookmark.range, bookmark.markText, bookmark.createTime]);
        const annotation: ReadingAnnotation = {
            id: createReadingId("annotation", [sourceKey, "highlight", originalId]),
            sourceKey,
            sourceType: "weread-book",
            bookID: input.bookID,
            title: input.title,
            annotationType: "highlight",
            content: bookmark.markText || "",
            chapterTitle: bookmark.chapterTitle || bookmark.chapterName || "",
            originalId,
            providerId: bookmark.bookmarkId,
            range: bookmark.range,
            createdAt: toJavaScriptTimestamp(bookmark.createTime),
            syncedAt: input.syncedAt,
            noteDocId: input.noteDocId,
        };
        attachBlockLocation(annotation, input.sourceIndex, [originalId, bookmark.bookmarkId], bookmark.range);
        annotations.push(annotation);
    }

    for (const review of input.reviews || []) {
        const originalId = review.reviewId || createReadingId("review", [input.bookID, review.range, review.content, review.createTime]);
        const annotation: ReadingAnnotation = {
            id: createReadingId("annotation", [sourceKey, "review", originalId]),
            sourceKey,
            sourceType: "weread-book",
            bookID: input.bookID,
            title: input.title,
            annotationType: "review",
            content: review.content || "",
            quote: review.abstract || "",
            chapterTitle: review.chapterTitle || review.chapterName || "",
            originalId,
            providerId: review.reviewId,
            range: review.range,
            createdAt: toJavaScriptTimestamp(review.createTime),
            syncedAt: input.syncedAt,
            noteDocId: input.noteDocId,
        };
        attachBlockLocation(annotation, input.sourceIndex, [originalId, review.reviewId], review.range);
        annotations.push(annotation);
    }

    return {
        sourceKey,
        sourceType: "weread-book",
        bookID: input.bookID,
        title: input.title,
        noteDocId: input.noteDocId,
        lastSyncedAt: input.syncedAt,
        annotations: finalizeAnnotations(annotations),
    };
}

export function buildMpAnnotationSource(input: {
    bookID: string;
    title: string;
    noteDocId?: string;
    articleUnits: MpArticleSyncUnit[];
    sourceIndex: WereadSourceBlockIndex;
    syncedAt: number;
}): ReadingAnnotationSourceArchive {
    const sourceKey = `weread-mp:${input.bookID}`;
    const annotations: ReadingAnnotation[] = [];

    for (const unit of input.articleUnits || []) {
        for (const note of unit.notes || []) {
            if (note.noteType === "highlight" && note.highlightText) {
                const originalId = createReadingId("mp_bookmark", [unit.articleID, note.range, note.highlightText, note.createTime]);
                const annotation: ReadingAnnotation = {
                    id: createReadingId("annotation", [sourceKey, "highlight", originalId]),
                    sourceKey,
                    sourceType: "weread-mp",
                    bookID: input.bookID,
                    title: input.title,
                    annotationType: "highlight",
                    content: note.highlightText,
                    articleID: unit.articleID,
                    articleTitle: unit.articleTitle,
                    originalId,
                    providerId: note.bookmarkIds?.find(Boolean),
                    range: note.range,
                    createdAt: toJavaScriptTimestamp(note.highlightCreateTime || note.createTime),
                    syncedAt: input.syncedAt,
                    noteDocId: input.noteDocId,
                };
                attachBlockLocation(annotation, input.sourceIndex, [originalId, ...(note.bookmarkIds || [])], note.range, unit.articleID);
                annotations.push(annotation);
            }

            for (const comment of note.comments || []) {
                const originalId = createReadingId("mp_review", [unit.articleID, note.range, comment.content, comment.createTime]);
                const annotation: ReadingAnnotation = {
                    id: createReadingId("annotation", [sourceKey, "review", originalId]),
                    sourceKey,
                    sourceType: "weread-mp",
                    bookID: input.bookID,
                    title: input.title,
                    annotationType: "review",
                    content: comment.content,
                    quote: note.highlightText || "",
                    articleID: unit.articleID,
                    articleTitle: unit.articleTitle,
                    originalId,
                    providerId: comment.reviewId,
                    range: note.range,
                    createdAt: toJavaScriptTimestamp(comment.createTime),
                    syncedAt: input.syncedAt,
                    noteDocId: input.noteDocId,
                };
                attachBlockLocation(annotation, input.sourceIndex, [originalId, comment.reviewId], note.range, unit.articleID);
                annotations.push(annotation);
            }
        }
    }

    return {
        sourceKey,
        sourceType: "weread-mp",
        bookID: input.bookID,
        title: input.title,
        noteDocId: input.noteDocId,
        lastSyncedAt: input.syncedAt,
        annotations: finalizeAnnotations(annotations),
    };
}

function attachBlockLocation(
    annotation: ReadingAnnotation,
    sourceIndex: WereadSourceBlockIndex,
    ids: Array<string | undefined>,
    range?: string,
    articleID?: string,
): void {
    const located = locateIndexedSourceItemBlock(sourceIndex, {
        ids: ids.filter((id): id is string => !!id),
        range,
        articleID,
    });
    if (!located) return;
    annotation.blockId = located.headBlockId;
    annotation.blockIds = located.blockIds;
}

function finalizeAnnotations(annotations: ReadingAnnotation[]): ReadingAnnotation[] {
    const unique = new Map<string, ReadingAnnotation>();
    for (const annotation of annotations) {
        if (!annotation.content.trim() || unique.has(annotation.id)) continue;
        unique.set(annotation.id, annotation);
    }
    return Array.from(unique.values());
}

function toJavaScriptTimestamp(value: unknown): number | undefined {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp)) return undefined;
    return timestamp < 1e12 ? timestamp * 1000 : timestamp;
}
