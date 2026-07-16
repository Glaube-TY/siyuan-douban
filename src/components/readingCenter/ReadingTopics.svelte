<script lang="ts">
    import { onMount, createEventDispatcher } from "svelte";
    import { showMessage } from "siyuan";
    import type { ReadingTopic, ReadingTopicItem } from "../../types/readingTopic";
    import type { ReadingInboxItem } from "../../types/readingInbox";
    import { createReadingId, getReadingInboxItems, getReadingTopicItems, getReadingTopics, saveReadingTopicItems, saveReadingTopics } from "../../utils/storage/readingStorage";
    import { openDoc } from "../../utils/openDoc";
    import { t } from "../../utils/i18n";

    export let plugin: any;
    export let pendingInboxItem: ReadingInboxItem | null = null;

    const dispatch = createEventDispatcher();
    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) => t(plugin, key, fallback, params);

    let topics: ReadingTopic[] = [];
    let topicItems: ReadingTopicItem[] = [];
    let inboxItems: ReadingInboxItem[] = [];
    let selectedTopicId = "";
    let newTopicName = "";
    let newTopicDesc = "";
    let selectedInboxItemId = "";

    onMount(loadAll);

    async function loadAll() {
        topics = await getReadingTopics(plugin);
        topicItems = await getReadingTopicItems(plugin);
        inboxItems = await getReadingInboxItems(plugin);
        if (!selectedTopicId && topics[0]) selectedTopicId = topics[0].id;
        if (pendingInboxItem) selectedInboxItemId = pendingInboxItem.id;
    }

    async function createTopic() {
        const name = newTopicName.trim();
        if (!name) return;
        const now = Date.now();
        const topic: ReadingTopic = {
            id: createReadingId("topic", [name, now]),
            name,
            description: newTopicDesc.trim(),
            color: "#4CAF50",
            createdAt: now,
            updatedAt: now,
        };
        topics = [topic, ...topics];
        selectedTopicId = topic.id;
        newTopicName = "";
        newTopicDesc = "";
        await saveReadingTopics(plugin, topics);
    }

    async function addInboxItemToTopic() {
        const topic = topics.find((item) => item.id === selectedTopicId);
        const inbox = inboxItems.find((item) => item.id === selectedInboxItemId) || pendingInboxItem;
        if (!topic || !inbox) {
            showMessage(tx("topicsSelectRequired", "请选择主题和新增笔记"));
            return;
        }
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
        const exists = topicItems.some((entry) => entry.id === item.id);
        if (!exists) {
            topicItems = [item, ...topicItems];
            await saveReadingTopicItems(plugin, topicItems);
        }
        pendingInboxItem = null;
        showMessage(tx("topicsAdded", "已加入主题"));
    }

    function openTopicItem(item: ReadingTopicItem) {
        if (!item.noteDocId) {
            showMessage(tx("topicsNoLocalNote", "该摘录暂无可打开的本地笔记"));
            return;
        }
        openDoc(plugin, item.noteDocId, 1);
    }

    async function copyTopic(topic: ReadingTopic) {
        const items = topicItems.filter((item) => item.topicId === topic.id);
        const text = [
            `# ${topic.name}`,
            topic.description || "",
            ...items.map((item) => `- ${item.content}\n  ${tx("topicsSource", "来源：")}${item.title}`),
        ].filter(Boolean).join("\n\n");
        try {
            await navigator.clipboard.writeText(text);
            showMessage(tx("topicsCopied", "已复制主题内容"));
        } catch {
            showMessage(tx("uiCopyFailed", "复制失败，请检查剪贴板权限"));
        }
    }

    $: selectedTopic = topics.find((item) => item.id === selectedTopicId) || null;
    $: selectedTopicItems = selectedTopic ? topicItems.filter((item) => item.topicId === selectedTopic.id) : [];
</script>

<div class="reading-page">
    <div class="page-header">
        <button class="back-btn" on:click={() => dispatch("back")}>{tx("uiBackOverview", "返回总览")}</button>
        <div>
            <h2>{tx("topicsTitle", "主题阅读")}</h2>
            <p>{tx("topicsDesc", "手动创建主题，把不同书里的摘录和想法聚合到一起")}</p>
        </div>
    </div>

    <div class="topic-layout">
        <aside class="topic-sidebar">
            <div class="topic-form">
                <input bind:value={newTopicName} placeholder={tx("topicsNewName", "新主题名称")} />
                <textarea bind:value={newTopicDesc} placeholder={tx("topicsDescription", "主题说明")}></textarea>
                <button on:click={createTopic}>{tx("topicsCreate", "创建主题")}</button>
            </div>

            <div class="topic-list">
                {#each topics as topic (topic.id)}
                    <button class:active={selectedTopicId === topic.id} on:click={() => (selectedTopicId = topic.id)}>
                        <span>{topic.name}</span>
                        <small>{tx("topicsItemCount", "{count} 条", { count: topicItems.filter((item) => item.topicId === topic.id).length })}</small>
                    </button>
                {/each}
            </div>
        </aside>

        <main class="topic-main">
            {#if selectedTopic}
                <div class="topic-card">
                    <div>
                        <h3>{selectedTopic.name}</h3>
                        <p>{selectedTopic.description || tx("topicsNoDescription", "暂无说明")}</p>
                    </div>
                    <button on:click={() => copyTopic(selectedTopic)}>{tx("topicsCopy", "复制主题")}</button>
                </div>

                <div class="add-row">
                    <select bind:value={selectedInboxItemId}>
                        <option value="">{tx("topicsSelectNote", "选择新增笔记")}</option>
                        {#each inboxItems as item (item.id)}
                            <option value={item.id}>{item.title} - {item.content || item.reviewContent}</option>
                        {/each}
                    </select>
                    <button on:click={addInboxItemToTopic}>{tx("topicsAdd", "加入主题")}</button>
                </div>

                {#if selectedTopicItems.length === 0}
                    <div class="empty">{tx("topicsEmpty", "这个主题还没有摘录")}</div>
                {:else}
                    <div class="topic-items">
                        {#each selectedTopicItems as item (item.id)}
                            <article>
                                <p>{item.content}</p>
                                {#if item.comment}<div class="comment">{item.comment}</div>{/if}
                                <div class="meta">
                                    <span>{item.title}</span>
                                    <button on:click={() => openTopicItem(item)}>{tx("uiOpenOriginalNote", "打开原笔记")}</button>
                                </div>
                            </article>
                        {/each}
                    </div>
                {/if}
            {:else}
                <div class="empty">{tx("topicsCreateFirst", "请先创建主题")}</div>
            {/if}
        </main>
    </div>
</div>

<style>
    .reading-page { max-width: 1180px; margin: 0 auto; padding: clamp(16px, 2vw, 28px); }
    .page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
    h2, h3, p { margin: 0; }
    h2 { font-size: 20px; margin-bottom: 4px; }
    p { color: var(--b3-theme-on-surface-light, #666); font-size: 13px; line-height: 1.5; }
    button, input, select, textarea { border: 1px solid var(--b3-border-color, #e0e0e0); background: var(--b3-theme-surface, #fff); border-radius: 6px; padding: 6px 10px; font-size: 12px; }
    button { cursor: pointer; }
    .topic-layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 14px; }
    .topic-sidebar, .topic-main, .topic-card, .empty, article { background: var(--b3-theme-surface, #fff); border: 1px solid var(--b3-border-color, #e0e0e0); border-radius: 8px; }
    .topic-sidebar { padding: 12px; }
    .topic-form { display: flex; flex-direction: column; gap: 8px; }
    .topic-form textarea { min-height: 68px; resize: vertical; }
    .topic-list { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
    .topic-list button { display: flex; justify-content: space-between; text-align: left; }
    .topic-list button.active { color: var(--b3-theme-primary, #4CAF50); border-color: var(--b3-theme-primary, #4CAF50); }
    .topic-main { padding: 12px; }
    .topic-card, .add-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 12px; }
    .add-row select { flex: 1; min-width: 0; }
    .empty { padding: 36px; text-align: center; color: var(--b3-theme-on-surface-light, #666); }
    .topic-items { display: flex; flex-direction: column; gap: 10px; }
    article { padding: 12px; }
    article p { color: var(--b3-theme-on-surface, #1a1a1a); }
    .comment { margin-top: 8px; font-size: 12px; color: var(--b3-theme-on-surface-light, #666); }
    .meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; color: var(--b3-theme-on-surface-light, #777); }
    @media (max-width: 800px) { .topic-layout { grid-template-columns: 1fr; } }
</style>

