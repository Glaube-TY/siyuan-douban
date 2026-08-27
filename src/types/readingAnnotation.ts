export type ReadingAnnotationType = "highlight" | "review";

export type ReadingAnnotationSourceType = "weread-book" | "weread-mp";

export interface ReadingAnnotation {
    id: string;
    sourceKey: string;
    sourceType: ReadingAnnotationSourceType;
    bookID: string;
    title: string;
    annotationType: ReadingAnnotationType;
    content: string;
    quote?: string;
    chapterTitle?: string;
    articleID?: string;
    articleTitle?: string;
    originalId: string;
    providerId?: string;
    range?: string;
    createdAt?: number;
    syncedAt: number;
    noteDocId?: string;
    blockId?: string;
    blockIds?: string[];
}

export interface ReadingAnnotationSourceArchive {
    sourceKey: string;
    sourceType: ReadingAnnotationSourceType;
    bookID: string;
    title: string;
    noteDocId?: string;
    lastSyncedAt: number;
    annotations: ReadingAnnotation[];
}

export interface ReadingAnnotationArchive {
    schemaVersion: 1;
    updatedAt: number;
    sources: Record<string, ReadingAnnotationSourceArchive>;
}
