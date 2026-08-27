import type {
    ReadingAnnotation,
    ReadingAnnotationArchive,
    ReadingAnnotationSourceArchive,
    ReadingAnnotationSourceType,
} from "../../types/readingAnnotation";
import { loadPluginStorageJsonStateStrict } from "./pluginStorageStrict";
import type { PluginLike as PluginStoragePluginLike } from "./pluginStorageStrict";

export const READING_ANNOTATION_ARCHIVE_KEY = "reading_annotation_archive_v1";

type PluginLike = PluginStoragePluginLike & {
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<void>;
};

export function createEmptyReadingAnnotationArchive(): ReadingAnnotationArchive {
    return {
        schemaVersion: 1,
        updatedAt: Date.now(),
        sources: {},
    };
}

export async function loadReadingAnnotationArchive(plugin: PluginLike): Promise<ReadingAnnotationArchive> {
    return (await loadReadingAnnotationArchiveState(plugin)).archive;
}

export async function loadReadingAnnotationArchiveState(plugin: PluginLike): Promise<{
    archive: ReadingAnnotationArchive;
    exists: boolean;
}> {
    const state = await loadPluginStorageJsonStateStrict(plugin, READING_ANNOTATION_ARCHIVE_KEY);
    if (!state.exists) {
        return { archive: createEmptyReadingAnnotationArchive(), exists: false };
    }
    return { archive: validateReadingAnnotationArchive(state.value), exists: true };
}

export async function saveReadingAnnotationArchive(
    plugin: PluginLike,
    archive: ReadingAnnotationArchive,
): Promise<void> {
    const validated = validateReadingAnnotationArchive(archive);
    await plugin.saveData(READING_ANNOTATION_ARCHIVE_KEY, validated);
}

export async function replaceReadingAnnotationSource(
    plugin: PluginLike,
    source: ReadingAnnotationSourceArchive,
): Promise<ReadingAnnotationArchive> {
    const validatedSource = validateReadingAnnotationSource(source);
    const current = await loadReadingAnnotationArchive(plugin);
    const next: ReadingAnnotationArchive = {
        ...current,
        updatedAt: Date.now(),
        sources: {
            ...current.sources,
            [validatedSource.sourceKey]: validatedSource,
        },
    };

    await saveReadingAnnotationArchive(plugin, next);

    const verified = await loadReadingAnnotationArchive(plugin);
    const savedSource = verified.sources[validatedSource.sourceKey];
    if (!savedSource) {
        throw new Error(`历史批注索引回读缺少来源：${validatedSource.sourceKey}`);
    }
    if (savedSource.annotations.length !== validatedSource.annotations.length) {
        throw new Error(`历史批注索引回读数量不一致：${validatedSource.sourceKey}`);
    }
    const expectedIds = new Set(validatedSource.annotations.map((annotation) => annotation.id));
    const actualIds = new Set(savedSource.annotations.map((annotation) => annotation.id));
    if (expectedIds.size !== actualIds.size || Array.from(expectedIds).some((id) => !actualIds.has(id))) {
        throw new Error(`历史批注索引回读内容不一致：${validatedSource.sourceKey}`);
    }

    return verified;
}

function validateReadingAnnotationArchive(value: unknown): ReadingAnnotationArchive {
    if (!value || typeof value !== "object") {
        throw new Error("历史批注索引格式无效");
    }
    const archive = value as Partial<ReadingAnnotationArchive>;
    if (archive.schemaVersion !== 1) {
        throw new Error("历史批注索引版本不受支持");
    }
    if (!Number.isFinite(archive.updatedAt)) {
        throw new Error("历史批注索引更新时间无效");
    }
    if (!archive.sources || typeof archive.sources !== "object" || Array.isArray(archive.sources)) {
        throw new Error("历史批注索引来源数据无效");
    }

    const sources: Record<string, ReadingAnnotationSourceArchive> = {};
    for (const [sourceKey, source] of Object.entries(archive.sources)) {
        const validated = validateReadingAnnotationSource(source);
        if (sourceKey !== validated.sourceKey) {
            throw new Error(`历史批注索引来源键不一致：${sourceKey}`);
        }
        sources[sourceKey] = validated;
    }

    return {
        schemaVersion: 1,
        updatedAt: archive.updatedAt,
        sources,
    };
}

function validateReadingAnnotationSource(value: unknown): ReadingAnnotationSourceArchive {
    if (!value || typeof value !== "object") {
        throw new Error("历史批注索引来源格式无效");
    }
    const source = value as Partial<ReadingAnnotationSourceArchive>;
    if (!isNonEmptyString(source.sourceKey) || !isAnnotationSourceType(source.sourceType)) {
        throw new Error("历史批注索引来源标识无效");
    }
    if (!isString(source.bookID) || !isString(source.title) || !Number.isFinite(source.lastSyncedAt)) {
        throw new Error(`历史批注索引来源字段无效：${source.sourceKey}`);
    }
    if (source.noteDocId !== undefined && !isString(source.noteDocId)) {
        throw new Error(`历史批注索引笔记文档无效：${source.sourceKey}`);
    }
    if (!Array.isArray(source.annotations)) {
        throw new Error(`历史批注索引批注列表无效：${source.sourceKey}`);
    }

    const annotations = source.annotations.map(validateReadingAnnotation);
    const ids = new Set<string>();
    for (const annotation of annotations) {
        if (annotation.sourceKey !== source.sourceKey) {
            throw new Error(`历史批注索引批注来源不一致：${annotation.id}`);
        }
        if (ids.has(annotation.id)) {
            throw new Error(`历史批注索引存在重复批注：${annotation.id}`);
        }
        ids.add(annotation.id);
    }

    return {
        sourceKey: source.sourceKey,
        sourceType: source.sourceType,
        bookID: source.bookID,
        title: source.title,
        noteDocId: source.noteDocId,
        lastSyncedAt: source.lastSyncedAt,
        annotations,
    };
}

function validateReadingAnnotation(value: unknown): ReadingAnnotation {
    if (!value || typeof value !== "object") {
        throw new Error("历史批注索引批注格式无效");
    }
    const annotation = value as Partial<ReadingAnnotation>;
    if (
        !isNonEmptyString(annotation.id) ||
        !isNonEmptyString(annotation.sourceKey) ||
        !isAnnotationSourceType(annotation.sourceType) ||
        !isString(annotation.bookID) ||
        !isString(annotation.title) ||
        (annotation.annotationType !== "highlight" && annotation.annotationType !== "review") ||
        !isString(annotation.content) ||
        !isNonEmptyString(annotation.originalId) ||
        !Number.isFinite(annotation.syncedAt)
    ) {
        throw new Error("历史批注索引批注字段无效");
    }
    for (const key of ["quote", "chapterTitle", "articleID", "articleTitle", "providerId", "range", "noteDocId", "blockId"] as const) {
        if (annotation[key] !== undefined && !isString(annotation[key])) {
            throw new Error(`历史批注索引批注字段无效：${key}`);
        }
    }
    if (annotation.createdAt !== undefined && !Number.isFinite(annotation.createdAt)) {
        throw new Error("历史批注索引批注创建时间无效");
    }
    if (annotation.blockIds !== undefined && (!Array.isArray(annotation.blockIds) || annotation.blockIds.some((id) => !isString(id)))) {
        throw new Error("历史批注索引批注块列表无效");
    }

    return {
        id: annotation.id,
        sourceKey: annotation.sourceKey,
        sourceType: annotation.sourceType,
        bookID: annotation.bookID,
        title: annotation.title,
        annotationType: annotation.annotationType,
        content: annotation.content,
        quote: annotation.quote,
        chapterTitle: annotation.chapterTitle,
        articleID: annotation.articleID,
        articleTitle: annotation.articleTitle,
        originalId: annotation.originalId,
        providerId: annotation.providerId,
        range: annotation.range,
        createdAt: annotation.createdAt,
        syncedAt: annotation.syncedAt,
        noteDocId: annotation.noteDocId,
        blockId: annotation.blockId,
        blockIds: annotation.blockIds,
    };
}

function isAnnotationSourceType(value: unknown): value is ReadingAnnotationSourceType {
    return value === "weread-book" || value === "weread-mp";
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isString(value: unknown): value is string {
    return typeof value === "string";
}
