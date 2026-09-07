import type { ReadingAnnotation, ReadingAnnotationType } from "../../types/readingAnnotation";
import type { ReadingInboxItem } from "../../types/readingInbox";
import type { ReadingTopicItem } from "../../types/readingTopic";
import { getIgnoredBookIDSet } from "../weread/wereadSyncStorage";
import { loadReadingInboxItemsForMutationStrict } from "../readingManagement/managementStorage";
import { loadPluginStorageJsonStateStrict } from "../storage/pluginStorageStrict";
import { createReadingId } from "../storage/readingStorage";
import { loadReadingAnnotationArchiveState } from "../storage/readingAnnotationStorage";
import {
    getReadingAnnotationArchiveCoverage,
    type ReadingAnnotationArchiveCoverage,
} from "./readingAnnotationArchiveCoverage";

const SEARCH_RESULT_LIMIT = 50;
const RECENT_RESULT_LIMIT = 12;

export interface ReadingTopicNoteSearchResult {
    annotation: ReadingAnnotation;
    score: number;
    topicIds: string[];
    topicItemIds: string[];
    isPending: boolean;
}

export interface ReadingTopicNoteSearchData {
    annotations: ReadingAnnotation[];
    pendingAnnotationId?: string;
    coverage: ReadingAnnotationArchiveCoverage;
}

export interface ReadingTopicNoteSearchResults {
    totalMatched: number;
    visibleResults: ReadingTopicNoteSearchResult[];
}

export interface ReadingTopicMembership {
    topicIds: Set<string>;
    topicItemIds: Set<string>;
}

export async function loadReadingTopicNoteSearchData(
    plugin: any,
    pendingInboxItem?: ReadingInboxItem | null,
): Promise<ReadingTopicNoteSearchData> {
    const [archiveState, inboxItems, syncedState, ignoredState] = await Promise.all([
        loadReadingAnnotationArchiveState(plugin),
        loadReadingInboxItemsForMutationStrict(plugin),
        loadPluginStorageJsonStateStrict(plugin, "weread_notebooks"),
        loadPluginStorageJsonStateStrict(plugin, "weread_ignoredBooks"),
    ]);

    const syncedRecords = toRecordArray(syncedState, "weread_notebooks");
    const ignoredBooks = toRecordArray(ignoredState, "weread_ignoredBooks");
    const ignoredBookIDs = getIgnoredBookIDSet(ignoredBooks);
    const candidates = new Map<string, ReadingAnnotation>();

    for (const source of Object.values(archiveState.archive.sources)) {
        for (const annotation of source.annotations) {
            if (!candidates.has(annotation.id)) candidates.set(annotation.id, annotation);
        }
    }

    const inboxAnnotations = inboxItems
        .map(createReadingAnnotationFromInboxItem)
        .filter((annotation): annotation is ReadingAnnotation => !!annotation);
    for (const annotation of inboxAnnotations) {
        if (!candidates.has(annotation.id)) candidates.set(annotation.id, annotation);
    }

    let pendingAnnotationId: string | undefined;
    if (pendingInboxItem) {
        const pendingAnnotation = createReadingAnnotationFromInboxItem(pendingInboxItem);
        if (pendingAnnotation) {
            pendingAnnotationId = pendingAnnotation.id;
            if (!candidates.has(pendingAnnotation.id)) candidates.set(pendingAnnotation.id, pendingAnnotation);
        }
    }

    const additionalSourceKeys = new Set(inboxAnnotations.map((annotation) => annotation.sourceKey));
    if (pendingAnnotationId) {
        const pending = candidates.get(pendingAnnotationId);
        if (pending) additionalSourceKeys.add(pending.sourceKey);
    }

    return {
        annotations: Array.from(candidates.values()),
        pendingAnnotationId,
        coverage: getReadingAnnotationArchiveCoverage(
            archiveState.archive,
            archiveState.exists,
            syncedRecords,
            ignoredBookIDs,
            additionalSourceKeys,
        ),
    };
}

export function createReadingAnnotationFromInboxItem(inbox: ReadingInboxItem): ReadingAnnotation | null {
    if (inbox.itemType === "mp_article") return null;
    if (inbox.itemType !== "bookmark" && inbox.itemType !== "review") {
        throw new Error("reading_inbox_items 中存在无法识别的笔记类型。");
    }
    if (inbox.sourceType !== "weread-book" && inbox.sourceType !== "weread-mp") return null;
    if (!isNonEmptyString(inbox.sourceKey) || !isNonEmptyString(inbox.originalId)) {
        throw new Error("reading_inbox_items 中存在无法识别的笔记来源。");
    }
    if (typeof inbox.bookID !== "string" || typeof inbox.title !== "string" || typeof inbox.content !== "string") {
        throw new Error("reading_inbox_items 中存在无法搜索的笔记记录。");
    }
    if (inbox.reviewContent !== undefined && typeof inbox.reviewContent !== "string") {
        throw new Error("reading_inbox_items 中存在无法搜索的想法记录。");
    }
    if (!Number.isFinite(inbox.createdAt)) {
        throw new Error("reading_inbox_items 中存在无效的笔记时间。");
    }

    const annotationType: ReadingAnnotationType = inbox.itemType === "bookmark" ? "highlight" : "review";
    const hasReviewContent = annotationType === "review" && !!inbox.reviewContent?.trim();
    return {
        id: createReadingId("annotation", [inbox.sourceKey, annotationType, inbox.originalId]),
        sourceKey: inbox.sourceKey,
        sourceType: inbox.sourceType,
        bookID: inbox.bookID,
        title: inbox.title,
        annotationType,
        content: hasReviewContent ? inbox.reviewContent! : inbox.content,
        quote: hasReviewContent ? inbox.content : undefined,
        chapterTitle: inbox.chapterTitle,
        articleTitle: inbox.articleTitle,
        originalId: inbox.originalId,
        createdAt: inbox.createdAt,
        syncedAt: inbox.createdAt,
        noteDocId: inbox.noteDocId,
    };
}

export function getReadingTopicItemProjection(annotation: ReadingAnnotation): {
    content: string;
    comment?: string;
} {
    const hasQuote = annotation.annotationType === "review" && !!annotation.quote?.trim();
    return {
        content: hasQuote ? annotation.quote! : annotation.content,
        comment: hasQuote ? annotation.content : undefined,
    };
}

export function buildReadingTopicMembershipIndex(
    topicItems: ReadingTopicItem[],
    annotations: ReadingAnnotation[],
): Map<string, ReadingTopicMembership> {
    const index = new Map<string, ReadingTopicMembership>();
    const annotationById = new Map<string, ReadingAnnotation>();
    const annotationIdsByBlockId = new Map<string, string[]>();
    const annotationIdsBySemanticKey = new Map<string, string[]>();

    for (const annotation of annotations) {
        index.set(annotation.id, { topicIds: new Set(), topicItemIds: new Set() });
        annotationById.set(annotation.id, annotation);
        const blockIds = new Set([annotation.blockId, ...(annotation.blockIds || [])].filter(isNonEmptyString));
        for (const blockId of blockIds) addMapValue(annotationIdsByBlockId, blockId, annotation.id);
        addMapValue(annotationIdsBySemanticKey, getAnnotationSemanticKey(annotation), annotation.id);
    }

    for (const item of topicItems) {
        let matchingAnnotationIds: string[] = [];
        if (isNonEmptyString(item.annotationId)) {
            matchingAnnotationIds = annotationById.has(item.annotationId) ? [item.annotationId] : [];
        } else if (isNonEmptyString(item.blockId)) {
            matchingAnnotationIds = annotationIdsByBlockId.get(item.blockId) || [];
        } else {
            matchingAnnotationIds = annotationIdsBySemanticKey.get(getTopicItemSemanticKey(item)) || [];
        }

        if (matchingAnnotationIds.length !== 1) continue;
        const membership = index.get(matchingAnnotationIds[0]);
        if (!membership) continue;
        membership.topicIds.add(item.topicId);
        membership.topicItemIds.add(item.id);
    }

    return index;
}

export function searchReadingTopicNotes(
    annotations: ReadingAnnotation[],
    topicItems: ReadingTopicItem[],
    query: string,
    pendingAnnotationId?: string,
): ReadingTopicNoteSearchResults {
    const normalizedQuery = normalizeSearchText(query);
    const membershipIndex = buildReadingTopicMembershipIndex(topicItems, annotations);
    const results = annotations
        .map((annotation) => {
            const score = scoreAnnotation(annotation, normalizedQuery);
            if (score === null) return null;
            const membership = membershipIndex.get(annotation.id) || { topicIds: new Set(), topicItemIds: new Set() };
            return {
                annotation,
                score,
                topicIds: Array.from(membership.topicIds),
                topicItemIds: Array.from(membership.topicItemIds),
                isPending: annotation.id === pendingAnnotationId,
            } satisfies ReadingTopicNoteSearchResult;
        })
        .filter((result): result is ReadingTopicNoteSearchResult => !!result)
        .sort((left, right) => {
            if (left.isPending !== right.isPending) return left.isPending ? -1 : 1;
            return right.score - left.score
                || annotationTime(right.annotation) - annotationTime(left.annotation)
                || left.annotation.id.localeCompare(right.annotation.id);
        });

    return {
        totalMatched: results.length,
        visibleResults: results.slice(0, normalizedQuery ? SEARCH_RESULT_LIMIT : RECENT_RESULT_LIMIT),
    };
}

function scoreAnnotation(annotation: ReadingAnnotation, query: string): number | null {
    if (!query) return 0;

    const fields = [
        { value: normalizeSearchText(annotation.content), weight: 40 },
        { value: normalizeSearchText(annotation.quote), weight: 24 },
        { value: normalizeSearchText(annotation.title), weight: 30 },
        { value: normalizeSearchText(annotation.chapterTitle), weight: 18 },
        { value: normalizeSearchText(annotation.articleTitle), weight: 18 },
    ].filter((field) => field.value);
    const tokens = query.split(" ").filter(Boolean);
    let score = 0;

    for (const token of tokens) {
        const matches = fields.filter((field) => field.value.includes(token));
        if (matches.length === 0) return null;
        score += Math.max(...matches.map((field) => field.weight));
    }

    const phraseMatches = fields.filter((field) => field.value.includes(query));
    if (phraseMatches.length > 0) score += 100 + Math.max(...phraseMatches.map((field) => field.weight));
    return score;
}

function getAnnotationSemanticKey(annotation: ReadingAnnotation): string {
    const projection = getReadingTopicItemProjection(annotation);
    return createSemanticKey([
        annotation.sourceType,
        annotation.bookID,
        annotation.noteDocId,
        annotation.title,
        projection.content,
        projection.comment,
    ]);
}

function getTopicItemSemanticKey(item: ReadingTopicItem): string {
    return createSemanticKey([
        item.sourceType,
        item.bookID,
        item.noteDocId,
        item.title,
        item.content,
        item.comment,
    ]);
}

function createSemanticKey(values: unknown[]): string {
    return values.map((value) => String(value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ")).join("\u001f");
}

function addMapValue(map: Map<string, string[]>, key: string, value: string): void {
    const values = map.get(key) || [];
    if (!values.includes(value)) values.push(value);
    map.set(key, values);
}

function annotationTime(annotation: ReadingAnnotation): number {
    return annotation.createdAt ?? annotation.syncedAt ?? 0;
}

function normalizeSearchText(value: unknown): string {
    return String(value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function toRecordArray(state: { exists: boolean; value?: unknown }, key: string): unknown[] {
    if (!state.exists) return [];
    if (!Array.isArray(state.value)) throw new Error(`${key} 数据格式无效`);
    return state.value;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}
