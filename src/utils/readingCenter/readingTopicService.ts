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

    const topics = await loadStrictArray<ReadingTopic>(plugin, STORAGE_KEYS.topics);
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
    await plugin.saveData(STORAGE_KEYS.topics, nextTopics);

    const verifiedTopics = await loadStrictArray<ReadingTopic>(plugin, STORAGE_KEYS.topics);
    if (!verifiedTopics.some((entry) => entry.id === topic.id)) {
        throw new Error("主题保存后验证失败");
    }

    return topic;
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
    const { topics, topicItems } = await loadReadingTopicsForPicker(plugin);
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
    await plugin.saveData(STORAGE_KEYS.topicItems, nextItems);

    const verifiedItems = await loadStrictArray<ReadingTopicItem>(plugin, STORAGE_KEYS.topicItems);
    if (!verifiedItems.some((entry) => entry.id === item.id)) {
        throw new Error("主题内容保存后验证失败");
    }

    return { added: true, alreadyExists: false, topic, item };
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
    const { topics, topicItems } = await loadReadingTopicsForPicker(plugin);
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
    await plugin.saveData(STORAGE_KEYS.topicItems, nextItems);

    const verifiedItems = await loadStrictArray<ReadingTopicItem>(plugin, STORAGE_KEYS.topicItems);
    if (!verifiedItems.some((entry) => entry.id === item.id)) {
        throw new Error("主题内容保存后验证失败");
    }

    return { added: true, alreadyExists: false, topic, item };
}
