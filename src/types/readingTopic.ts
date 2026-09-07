import type { ReadingAnnotationType } from "./readingAnnotation";
import type { ReadingSourceType } from "./readingStatus";

export interface ReadingTopic {
    id: string;
    name: string;
    description?: string;
    color?: string;
    createdAt: number;
    updatedAt: number;
}

export interface ReadingTopicItem {
    id: string;
    topicId: string;
    sourceType: ReadingSourceType | "local";
    title: string;
    bookID?: string;
    noteDocId?: string;
    blockId?: string;
    annotationId?: string;
    sourceKey?: string;
    originalId?: string;
    annotationType?: ReadingAnnotationType;
    content: string;
    comment?: string;
    createdAt: number;
}

