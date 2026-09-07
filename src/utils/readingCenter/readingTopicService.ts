import type { ReadingAnnotation, ReadingAnnotationType } from "../../types/readingAnnotation";
import type { ReadingInboxItem } from "../../types/readingInbox";
import type { ReadingTopic, ReadingTopicItem } from "../../types/readingTopic";
import { createReadingId, STORAGE_KEYS } from "../storage/readingStorage";
import { loadPluginStorageJsonStateStrict } from "../storage/pluginStorageStrict";
import type { PluginLike as PluginStoragePluginLike } from "../storage/pluginStorageStrict";
import {
    createReadingAnnotationFromInboxItem,
    getReadingTopicItemProjection,
} from "./readingTopicNoteSearchService";

type ReadingTopicPlugin = PluginStoragePluginLike & {
    saveData: (key: string, value: any) => Promise<void>;
};

async function loadStrictArray<T>(plugin: ReadingTopicPlugin, storageKey: string): Promise<T[]> {
    const state = await loadPluginStorageJsonStateStrict(plugin, storageKey);
    if (!state.exists) return [];
    if (!Array.isArray(state.value)) throw new Error(`${storageKey} 数据格式无效`);
    return state.value as T[];
}

const INVALID_TOPICS_RECORD_ERROR = "reading_topics 中存在无法识别的记录，为避免数据丢失已取消写入。";
const INVALID_TOPIC_ITEMS_RECORD_ERROR = "reading_topic_items 中存在无法识别的记录，为避免数据丢失已取消写入。";

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!isRecord(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function hasValidOptionalNonEmptyString(record: Record<string, unknown>, key: string): boolean {
    if (!Object.prototype.hasOwnProperty.call(record, key)) return true;
    return isNonEmptyString(record[key]);
}

function hasValidOptionalAnnotationType(record: Record<string, unknown>): boolean {
    if (!Object.prototype.hasOwnProperty.call(record, "annotationType")) return true;
    return record.annotationType === "highlight" || record.annotationType === "review";
}

function hasValidOptionalFiniteNumber(record: Record<string, unknown>, key: string): boolean {
    if (!Object.prototype.hasOwnProperty.call(record, key)) return true;
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value);
}

function validateReadingTopics(items: unknown): ReadingTopic[] {
    if (!Array.isArray(items)) throw new Error(INVALID_TOPICS_RECORD_ERROR);

    const ids = new Set<string>();
    for (const item of items) {
        if (
            !isPlainObject(item)
            || !isNonEmptyString(item.id)
            || !isNonEmptyString(item.name)
            || !hasValidOptionalFiniteNumber(item, "createdAt")
            || !hasValidOptionalFiniteNumber(item, "updatedAt")
        ) {
            throw new Error(INVALID_TOPICS_RECORD_ERROR);
        }
        if (ids.has(item.id)) {
            throw new Error("reading_topics 中存在重复 id，为避免数据丢失已取消写入。");
        }
        ids.add(item.id);
    }
    return items as ReadingTopic[];
}

function validateReadingTopicItems(items: unknown): ReadingTopicItem[] {
    if (!Array.isArray(items)) throw new Error(INVALID_TOPIC_ITEMS_RECORD_ERROR);

    const ids = new Set<string>();
    for (const item of items) {
        if (
            !isPlainObject(item)
            || !isNonEmptyString(item.id)
            || !isNonEmptyString(item.topicId)
            || typeof item.content !== "string"
            || !hasValidOptionalNonEmptyString(item, "annotationId")
            || !hasValidOptionalNonEmptyString(item, "sourceKey")
            || !hasValidOptionalNonEmptyString(item, "originalId")
            || !hasValidOptionalAnnotationType(item)
        ) {
            throw new Error(INVALID_TOPIC_ITEMS_RECORD_ERROR);
        }
        if (ids.has(item.id)) {
            throw new Error("reading_topic_items 中存在重复 id，为避免数据丢失已取消写入。");
        }
        ids.add(item.id);
    }
    return items as ReadingTopicItem[];
}

export async function loadReadingTopicsForMutationStrict(plugin: ReadingTopicPlugin): Promise<ReadingTopic[]> {
    return validateReadingTopics(await loadStrictArray<unknown>(plugin, STORAGE_KEYS.topics));
}

export async function loadReadingTopicItemsForMutationStrict(plugin: ReadingTopicPlugin): Promise<ReadingTopicItem[]> {
    return validateReadingTopicItems(await loadStrictArray<unknown>(plugin, STORAGE_KEYS.topicItems));
}

export async function saveReadingTopicsStrictAndVerifyOrder(
    plugin: ReadingTopicPlugin,
    topics: ReadingTopic[],
): Promise<ReadingTopic[]> {
    const expectedTopics = validateReadingTopics(topics);
    const expectedIds = expectedTopics.map((topic) => topic.id);
    await plugin.saveData(STORAGE_KEYS.topics, expectedTopics);
    const verifiedTopics = await loadReadingTopicsForMutationStrict(plugin);
    if (
        verifiedTopics.length !== expectedIds.length
        || verifiedTopics.some((topic, index) => topic.id !== expectedIds[index])
    ) {
        throw new Error("主题顺序保存后验证失败");
    }
    return verifiedTopics;
}

export async function saveReadingTopicItemsStrictAndVerify(
    plugin: ReadingTopicPlugin,
    items: ReadingTopicItem[],
): Promise<ReadingTopicItem[]> {
    const expectedItems = validateReadingTopicItems(items);
    const expectedIds = expectedItems.map((item) => item.id);
    await plugin.saveData(STORAGE_KEYS.topicItems, expectedItems);
    const verifiedItems = await loadReadingTopicItemsForMutationStrict(plugin);
    if (
        verifiedItems.length !== expectedIds.length
        || verifiedItems.some((item, index) => (
            item.id !== expectedIds[index]
            || JSON.stringify(item) !== JSON.stringify(expectedItems[index])
        ))
    ) {
        throw new Error("主题内容保存后验证失败");
    }
    return verifiedItems;
}

export async function loadReadingTopicsForPicker(plugin: ReadingTopicPlugin): Promise<{
    topics: ReadingTopic[];
    topicItems: ReadingTopicItem[];
}> {
    const [topics, topicItems] = await Promise.all([
        loadStrictArray<ReadingTopic>(plugin, STORAGE_KEYS.topics),
        loadStrictArray<ReadingTopicItem>(plugin, STORAGE_KEYS.topicItems),
    ]);
    return { topics, topicItems };
}

export async function createReadingTopic(
    plugin: ReadingTopicPlugin,
    input: { name: string; description?: string },
): Promise<ReadingTopic> {
    const name = input.name.trim();
    if (!name) throw new Error("主题名称不能为空");

    const topics = await loadReadingTopicsForMutationStrict(plugin);
    const normalizedName = name.toLocaleLowerCase();
    if (topics.some((topic) => String(topic.name || "").trim().toLocaleLowerCase() === normalizedName)) {
        throw new Error("已存在同名主题");
    }

    const now = Date.now();
    const topic: ReadingTopic = {
        id: createReadingId("topic", [name, now]),
        name,
        description: (input.description || "").trim(),
        color: "#4CAF50",
        createdAt: now,
        updatedAt: now,
    };
    const nextTopics = [topic, ...topics];
    const verifiedTopics = await saveReadingTopicsStrictAndVerifyOrder(plugin, nextTopics);
    return verifiedTopics.find((entry) => entry.id === topic.id) || topic;
}

export async function reorderReadingTopic(
    plugin: ReadingTopicPlugin,
    topicId: string,
    targetIndex: number,
): Promise<{ reordered: boolean; topics: ReadingTopic[] }> {
    const topics = await loadReadingTopicsForMutationStrict(plugin);
    const sourceIndex = topics.findIndex((topic) => topic.id === topicId);
    if (sourceIndex < 0) throw new Error("所选主题已不存在，请重新选择。");
    if (!Number.isFinite(targetIndex) || !Number.isInteger(targetIndex)) {
        throw new Error("主题目标位置无效");
    }

    const boundedTargetIndex = Math.max(0, Math.min(targetIndex, topics.length - 1));
    if (sourceIndex === boundedTargetIndex) {
        return { reordered: false, topics };
    }

    const nextTopics = [...topics];
    const [topic] = nextTopics.splice(sourceIndex, 1);
    nextTopics.splice(boundedTargetIndex, 0, topic);
    const verifiedTopics = await saveReadingTopicsStrictAndVerifyOrder(plugin, nextTopics);
    return { reordered: true, topics: verifiedTopics };
}

export async function deleteReadingTopic(plugin: ReadingTopicPlugin, topicId: string): Promise<{
    deletedTopic: ReadingTopic;
    removedItemCount: number;
    topics: ReadingTopic[];
    topicItems: ReadingTopicItem[];
}> {
    const [topics, topicItems] = await Promise.all([
        loadReadingTopicsForMutationStrict(plugin),
        loadReadingTopicItemsForMutationStrict(plugin),
    ]);
    const topic = topics.find((entry) => entry.id === topicId);
    if (!topic) throw new Error("所选主题已不存在，请重新选择。");

    const nextTopics = topics.filter((entry) => entry.id !== topicId);
    const nextTopicItems = topicItems.filter((entry) => entry.topicId !== topicId);
    const verifiedTopics = await saveReadingTopicsStrictAndVerifyOrder(plugin, nextTopics);
    if (nextTopicItems.length === topicItems.length) {
        return { deletedTopic: topic, removedItemCount: 0, topics: verifiedTopics, topicItems };
    }

    try {
        const verifiedTopicItems = await saveReadingTopicItemsStrictAndVerify(plugin, nextTopicItems);
        return {
            deletedTopic: topic,
            removedItemCount: topicItems.length - nextTopicItems.length,
            topics: verifiedTopics,
            topicItems: verifiedTopicItems,
        };
    } catch (error) {
        try {
            await saveReadingTopicsStrictAndVerifyOrder(plugin, topics);
        } catch (recoveryError) {
            const message = recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
            throw new Error(`删除主题失败，且恢复主题失败：${message}`);
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`删除主题失败：${message}`);
    }
}

export type ReadingTopicAssignmentMode = "keep_other_topics" | "move_to_topic";

export interface ReadingTopicAssignmentResult {
    added: boolean;
    alreadyExists: boolean;
    mode: ReadingTopicAssignmentMode;
    topic: ReadingTopic;
    item: ReadingTopicItem;
    topicItems: ReadingTopicItem[];
    removedFromTopicIds: string[];
}

export interface ReadingTopicAssignmentOptions {
    mode?: ReadingTopicAssignmentMode;
    knownMembershipItemIds?: string[];
}

export function createReadingTopicItemFromAnnotation(
    topicId: string,
    annotation: ReadingAnnotation,
): ReadingTopicItem {
    const projection = getReadingTopicItemProjection(annotation);
    return {
        id: createReadingId("topic_item", [topicId, annotation.id]),
        topicId,
        annotationId: annotation.id,
        sourceKey: annotation.sourceKey,
        originalId: annotation.originalId,
        annotationType: annotation.annotationType,
        sourceType: annotation.sourceType,
        title: annotation.title,
        bookID: annotation.bookID,
        noteDocId: annotation.noteDocId,
        blockId: annotation.blockId,
        content: projection.content,
        comment: projection.comment,
        createdAt: annotation.createdAt ?? annotation.syncedAt,
    };
}

export async function assignReadingAnnotationToTopic(
    plugin: ReadingTopicPlugin,
    targetTopicId: string,
    annotation: ReadingAnnotation,
    options: ReadingTopicAssignmentOptions = {},
): Promise<ReadingTopicAssignmentResult> {
    assertValidReadingAnnotation(annotation);
    const mode = options.mode || "keep_other_topics";
    if (mode !== "keep_other_topics" && mode !== "move_to_topic") {
        throw new Error("主题分配模式无效");
    }

    const [topics, topicItems] = await Promise.all([
        loadReadingTopicsForMutationStrict(plugin),
        loadReadingTopicItemsForMutationStrict(plugin),
    ]);
    const topic = topics.find((entry) => entry.id === targetTopicId);
    if (!topic) throw new Error("所选主题已不存在，请重新选择。");

    const membershipItemIds = resolveMembershipItemIds(topicItems, annotation, options.knownMembershipItemIds);
    const membershipItems = topicItems.filter((item) => membershipItemIds.has(item.id));
    const currentItems = membershipItems.filter((item) => item.topicId === targetTopicId);

    if (mode === "keep_other_topics" && currentItems.length > 0) {
        return {
            added: false,
            alreadyExists: true,
            mode,
            topic,
            item: currentItems[0],
            topicItems,
            removedFromTopicIds: [],
        };
    }

    if (mode === "move_to_topic") {
        const keepItem = currentItems[0];
        const removedItems = membershipItems.filter((item) => item.id !== keepItem?.id);
        const removedFromTopicIds = Array.from(new Set(
            removedItems
                .map((item) => item.topicId)
                .filter((topicId) => topicId !== targetTopicId),
        ));
        if (removedItems.length === 0 && keepItem) {
            return {
                added: false,
                alreadyExists: true,
                mode,
                topic,
                item: keepItem,
                topicItems,
                removedFromTopicIds,
            };
        }

        const removedIds = new Set(removedItems.map((item) => item.id));
        const nextItems = topicItems.filter((item) => !removedIds.has(item.id));
        const item = keepItem || createReadingTopicItemFromAnnotation(targetTopicId, annotation);
        if (!keepItem) nextItems.unshift(item);
        const verifiedItems = await saveReadingTopicItemsStrictAndVerify(plugin, nextItems);
        return {
            added: !keepItem,
            alreadyExists: !!keepItem,
            mode,
            topic,
            item: verifiedItems.find((entry) => entry.id === item.id) || item,
            topicItems: verifiedItems,
            removedFromTopicIds,
        };
    }

    const item = createReadingTopicItemFromAnnotation(targetTopicId, annotation);
    if (topicItems.some((entry) => entry.id === item.id)) {
        return {
            added: false,
            alreadyExists: true,
            mode,
            topic,
            item: topicItems.find((entry) => entry.id === item.id) || item,
            topicItems,
            removedFromTopicIds: [],
        };
    }

    const verifiedItems = await saveReadingTopicItemsStrictAndVerify(plugin, [item, ...topicItems]);
    return {
        added: true,
        alreadyExists: false,
        mode,
        topic,
        item: verifiedItems.find((entry) => entry.id === item.id) || item,
        topicItems: verifiedItems,
        removedFromTopicIds: [],
    };
}

export async function addReadingInboxItemToTopic(
    plugin: ReadingTopicPlugin,
    topicId: string,
    inbox: ReadingInboxItem,
): Promise<ReadingTopicAssignmentResult> {
    const annotation = createReadingAnnotationFromInboxItem(inbox);
    if (!annotation) throw new Error("该待办不是可加入主题的阅读批注。");
    return assignReadingAnnotationToTopic(plugin, topicId, annotation, { mode: "keep_other_topics" });
}

export async function addReadingAnnotationToTopic(
    plugin: ReadingTopicPlugin,
    topicId: string,
    annotation: ReadingAnnotation,
): Promise<ReadingTopicAssignmentResult> {
    return assignReadingAnnotationToTopic(plugin, topicId, annotation, { mode: "keep_other_topics" });
}

function resolveMembershipItemIds(
    topicItems: ReadingTopicItem[],
    annotation: ReadingAnnotation,
    knownMembershipItemIds?: string[],
): Set<string> {
    const membershipItemIds = new Set<string>();
    if (knownMembershipItemIds !== undefined) {
        if (!Array.isArray(knownMembershipItemIds) || knownMembershipItemIds.some((id) => !isNonEmptyString(id))) {
            throw new Error("主题归属项标识无效");
        }
        const existingIds = new Set(topicItems.map((item) => item.id));
        for (const itemId of knownMembershipItemIds) {
            if (!existingIds.has(itemId)) throw new Error("主题归属项已不存在，请重新搜索。");
            membershipItemIds.add(itemId);
        }
    }

    for (const item of topicItems) {
        if (
            item.annotationId === annotation.id
            || item.id === createReadingId("topic_item", [item.topicId, annotation.id])
        ) {
            membershipItemIds.add(item.id);
        }
    }
    return membershipItemIds;
}

function assertValidReadingAnnotation(annotation: ReadingAnnotation): void {
    if (
        !annotation
        || !isNonEmptyString(annotation.id)
        || !isNonEmptyString(annotation.sourceKey)
        || (annotation.sourceType !== "weread-book" && annotation.sourceType !== "weread-mp")
        || typeof annotation.bookID !== "string"
        || typeof annotation.title !== "string"
        || !isReadingAnnotationType(annotation.annotationType)
        || typeof annotation.content !== "string"
        || !isNonEmptyString(annotation.originalId)
        || !Number.isFinite(annotation.syncedAt)
        || (annotation.createdAt !== undefined && !Number.isFinite(annotation.createdAt))
    ) {
        throw new Error("阅读批注数据无效");
    }
}

function isReadingAnnotationType(value: unknown): value is ReadingAnnotationType {
    return value === "highlight" || value === "review";
}
