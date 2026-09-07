import type { ReadingAnnotation } from "../../types/readingAnnotation";
import type { ReadingInboxItem } from "../../types/readingInbox";
import type { ReadingTopic, ReadingTopicItem } from "../../types/readingTopic";
import { createReadingId, STORAGE_KEYS } from "../storage/readingStorage";
import { loadPluginStorageJsonStateStrict } from "../storage/pluginStorageStrict";
import type { PluginLike as PluginStoragePluginLike } from "../storage/pluginStorageStrict";

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

export async function moveReadingTopic(
    plugin: ReadingTopicPlugin,
    topicId: string,
    direction: "up" | "down",
): Promise<{ moved: boolean; topics: ReadingTopic[] }> {
    const topics = await loadReadingTopicsForMutationStrict(plugin);
    const index = topics.findIndex((topic) => topic.id === topicId);
    if (index < 0) throw new Error("所选主题已不存在，请重新选择。");
    if (direction !== "up" && direction !== "down") throw new Error("主题移动方向无效");

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= topics.length) {
        return { moved: false, topics };
    }

    const nextTopics = [...topics];
    [nextTopics[index], nextTopics[targetIndex]] = [nextTopics[targetIndex], nextTopics[index]];
    const verifiedTopics = await saveReadingTopicsStrictAndVerifyOrder(plugin, nextTopics);
    return { moved: true, topics: verifiedTopics };
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

export async function addReadingInboxItemToTopic(
    plugin: ReadingTopicPlugin,
    topicId: string,
    inbox: ReadingInboxItem,
): Promise<{
    added: boolean;
    alreadyExists: boolean;
    topic: ReadingTopic;
    item: ReadingTopicItem;
}> {
    const [topics, topicItems] = await Promise.all([
        loadReadingTopicsForMutationStrict(plugin),
        loadReadingTopicItemsForMutationStrict(plugin),
    ]);
    const topic = topics.find((entry) => entry.id === topicId);
    if (!topic) throw new Error("所选主题已不存在，请重新选择。");

    const item: ReadingTopicItem = {
        id: createReadingId("topic_item", [topic.id, inbox.id]),
        topicId: topic.id,
        sourceType: inbox.sourceType,
        title: inbox.title,
        bookID: inbox.bookID,
        noteDocId: inbox.noteDocId,
        content: inbox.content || inbox.reviewContent || "",
        comment: inbox.reviewContent,
        createdAt: Date.now(),
    };

    if (topicItems.some((entry) => entry.id === item.id)) {
        return { added: false, alreadyExists: true, topic, item };
    }

    const nextItems = [item, ...topicItems];
    const verifiedItems = await saveReadingTopicItemsStrictAndVerify(plugin, nextItems);
    return {
        added: true,
        alreadyExists: false,
        topic,
        item: verifiedItems.find((entry) => entry.id === item.id) || item,
    };
}

export async function addReadingAnnotationToTopic(
    plugin: ReadingTopicPlugin,
    topicId: string,
    annotation: ReadingAnnotation,
): Promise<{
    added: boolean;
    alreadyExists: boolean;
    topic: ReadingTopic;
    item: ReadingTopicItem;
}> {
    const [topics, topicItems] = await Promise.all([
        loadReadingTopicsForMutationStrict(plugin),
        loadReadingTopicItemsForMutationStrict(plugin),
    ]);
    const topic = topics.find((entry) => entry.id === topicId);
    if (!topic) throw new Error("所选主题已不存在，请重新选择。");

    const hasQuote = annotation.annotationType === "review" && !!annotation.quote?.trim();
    const item: ReadingTopicItem = {
        id: createReadingId("topic_item", [topic.id, annotation.id]),
        topicId: topic.id,
        sourceType: annotation.sourceType,
        title: annotation.title,
        bookID: annotation.bookID,
        noteDocId: annotation.noteDocId,
        blockId: annotation.blockId,
        content: hasQuote ? annotation.quote! : annotation.content,
        comment: hasQuote ? annotation.content : undefined,
        createdAt: Date.now(),
    };

    if (topicItems.some((entry) => entry.id === item.id)) {
        return { added: false, alreadyExists: true, topic, item };
    }

    const nextItems = [item, ...topicItems];
    const verifiedItems = await saveReadingTopicItemsStrictAndVerify(plugin, nextItems);
    return {
        added: true,
        alreadyExists: false,
        topic,
        item: verifiedItems.find((entry) => entry.id === item.id) || item,
    };
}
