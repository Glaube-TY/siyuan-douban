<script lang="ts">
    import { onMount, createEventDispatcher } from "svelte";
    import { showMessage } from "siyuan";
    import { confirmDialog, svelteDialog } from "../../libs/dialog";
    import type { ReadingTopic, ReadingTopicItem } from "../../types/readingTopic";
    import type { ReadingInboxItem } from "../../types/readingInbox";
    import { getReadingInboxItems, getReadingTopicItems, getReadingTopics } from "../../utils/storage/readingStorage";
    import { openSiyuanBlock, openSiyuanDoc } from "../../utils/readingManagement/blockLocator";
    import {
        addReadingInboxItemToTopic,
        deleteReadingTopic,
        moveReadingTopic,
    } from "../../utils/readingCenter/readingTopicService";
    import { t } from "../../utils/i18n";
    import ReadingTopicCreateDialog from "./ReadingTopicCreateDialog.svelte";

    export let plugin: any;
    export let pendingInboxItem: ReadingInboxItem | null = null;
    export let embedded = false;

    const dispatch = createEventDispatcher();
    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) => t(plugin, key, fallback, params);

    let topics: ReadingTopic[] = [];
    let topicItems: ReadingTopicItem[] = [];
    let inboxItems: ReadingInboxItem[] = [];
    let selectedTopicId = "";
    let selectedInboxItemId = "";
    let topicMutation: "add" | "move" | "delete" | null = null;

    onMount(loadAll);

    async function loadAll() {
        topics = await getReadingTopics(plugin);
        topicItems = await getReadingTopicItems(plugin);
        inboxItems = await getReadingInboxItems(plugin);
        if (!selectedTopicId && topics[0]) selectedTopicId = topics[0].id;
        if (pendingInboxItem) selectedInboxItemId = pendingInboxItem.id;
    }

    function handleTopicCreated(topic: ReadingTopic): void {
        topics = [topic, ...topics.filter((item) => item.id !== topic.id)];
        selectedTopicId = topic.id;
    }

    function openCreateTopicDialog(): void {
        let dialogRef: any;
        const isMobileViewport = typeof window !== "undefined"
            && (window.matchMedia?.("(max-width: 600px)").matches || window.innerWidth <= 600);
        dialogRef = svelteDialog({
            title: tx("topicsCreateDialogTitle", "创建主题"),
            width: isMobileViewport ? "100vw" : "min(480px, 92vw)",
            height: isMobileViewport ? "100dvh" : undefined,
            disableClose: true,
            hideCloseIcon: true,
            constructor: (container: HTMLElement) => new ReadingTopicCreateDialog({
                target: container,
                props: {
                    plugin,
                    close: () => dialogRef?.close?.(),
                    onCreated: handleTopicCreated,
                },
            }),
        });
        if (isMobileViewport) {
            dialogRef.dialog.element.classList.add("siyuan-douban-mobile-subdialog");
        }
    }

    async function addInboxItemToTopic() {
        if (topicMutation) return;
        const topic = topics.find((item) => item.id === selectedTopicId);
        const inbox = inboxItems.find((item) => item.id === selectedInboxItemId) || pendingInboxItem;
        if (!topic || !inbox) {
            showMessage(tx("topicsSelectRequired", "请选择主题和新增笔记"));
            return;
        }

        topicMutation = "add";
        try {
            const result = await addReadingInboxItemToTopic(plugin, topic.id, inbox);
            if (result.added) {
                topicItems = [result.item, ...topicItems.filter((item) => item.id !== result.item.id)];
                pendingInboxItem = null;
                showMessage(tx("topicsAdded", "已加入主题"));
            } else if (result.alreadyExists) {
                showMessage(tx("topicsAlreadyAdded", "该内容已经在当前主题中"));
            }
        } catch (error: any) {
            showMessage(tx("topicsAddFailed", "加入主题失败：{error}", {
                error: error?.message || String(error) || tx("uiUnknownError", "未知错误"),
            }));
        } finally {
            topicMutation = null;
        }
    }

    async function moveSelectedTopic(direction: "up" | "down") {
        if (topicMutation || !selectedTopic) return;

        topicMutation = "move";
        try {
            const result = await moveReadingTopic(plugin, selectedTopic.id, direction);
            topics = result.topics;
        } catch (error: any) {
            showMessage(tx("topicsMoveFailed", "移动主题失败：{error}", {
                error: error?.message || String(error) || tx("uiUnknownError", "未知错误"),
            }));
        } finally {
            topicMutation = null;
        }
    }

    function requestDeleteTopic(topic: ReadingTopic) {
        if (topicMutation) return;

        const itemCount = topicItems.filter((item) => item.topicId === topic.id).length;
        const confirmation = document.createElement("p");
        confirmation.textContent = tx(
            "topicsDeleteConfirm",
            "确定删除主题「{topic}」吗？其中 {count} 条主题摘录也会从主题库中移除，但不会删除原始读书笔记。",
            { topic: topic.name, count: itemCount },
        );
        topicMutation = "delete";
        try {
            confirmDialog({
                title: tx("topicsDeleteConfirmTitle", "删除主题"),
                content: confirmation,
                cancel: () => {
                    topicMutation = null;
                },
                confirm: () => {
                    void deleteSelectedTopic(topic);
                },
            });
        } catch (error: any) {
            topicMutation = null;
            showMessage(tx("topicsDeleteFailed", "删除主题失败：{error}", {
                error: error?.message || String(error) || tx("uiUnknownError", "未知错误"),
            }));
        }
    }

    async function deleteSelectedTopic(topic: ReadingTopic) {
        const deletedIndex = topics.findIndex((item) => item.id === topic.id);
        try {
            const result = await deleteReadingTopic(plugin, topic.id);
            topics = result.topics;
            topicItems = result.topicItems;
            selectedTopicId = result.topics[deletedIndex]?.id || result.topics[deletedIndex - 1]?.id || "";
            showMessage(tx("topicsDeleted", "已删除主题「{topic}」", { topic: result.deletedTopic.name }));
        } catch (error: any) {
            showMessage(tx("topicsDeleteFailed", "删除主题失败：{error}", {
                error: error?.message || String(error) || tx("uiUnknownError", "未知错误"),
            }));
        } finally {
            topicMutation = null;
        }
    }

    function openTopicItem(item: ReadingTopicItem) {
        if (item.blockId && openSiyuanBlock(plugin, item.blockId)) return;
        if (item.noteDocId && openSiyuanDoc(plugin, item.noteDocId)) return;
        showMessage(tx("topicsNoLocalNote", "该摘录暂无可打开的本地笔记"));
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
    $: selectedTopicIndex = selectedTopic ? topics.findIndex((item) => item.id === selectedTopic.id) : -1;
</script>

<div class="reading-page" class:reading-page-embedded={embedded}>
    {#if !embedded}
        <div class="page-header">
            <button class="back-btn" on:click={() => dispatch("back")}>{tx("uiBackOverview", "返回总览")}</button>
            <div>
                <h2>{tx("topicsTitle", "主题阅读")}</h2>
                <p>{tx("topicsDesc", "手动创建主题，把不同书里的摘录和想法聚合到一起")}</p>
            </div>
        </div>
    {/if}

    <div class="topic-layout">
        <aside class="topic-sidebar">
            <div class="topic-list">
                {#if topics.length === 0}
                    <div class="topic-list-empty" role="status">{tx("topicsNoTopics", "暂无主题")}</div>
                {:else}
                    {#each topics as topic (topic.id)}
                        <button type="button" class:active={selectedTopicId === topic.id} on:click={() => (selectedTopicId = topic.id)} disabled={topicMutation !== null}>
                            <span>{topic.name}</span>
                            <small>{tx("topicsItemCount", "{count} 条", { count: topicItems.filter((item) => item.topicId === topic.id).length })}</small>
                        </button>
                    {/each}
                {/if}
            </div>

            <div class="topic-sidebar-footer">
                <button type="button" on:click={openCreateTopicDialog} disabled={topicMutation !== null}>{tx("topicsAddTopic", "添加主题")}</button>
            </div>
        </aside>

        <main class="topic-main">
            {#if selectedTopic}
                <div class="topic-card">
                    <div class="topic-card-content">
                        <h3>{selectedTopic.name}</h3>
                        <p>{selectedTopic.description || tx("topicsNoDescription", "暂无说明")}</p>
                    </div>
                    <div class="topic-actions">
                        <button
                            type="button"
                            class="topic-action-secondary"
                            on:click={() => moveSelectedTopic("up")}
                            disabled={topicMutation !== null || selectedTopicIndex <= 0}
                        >{tx("topicsMoveUp", "上移")}</button>
                        <button
                            type="button"
                            class="topic-action-secondary"
                            on:click={() => moveSelectedTopic("down")}
                            disabled={topicMutation !== null || selectedTopicIndex < 0 || selectedTopicIndex >= topics.length - 1}
                        >{tx("topicsMoveDown", "下移")}</button>
                        <button type="button" on:click={() => copyTopic(selectedTopic)} disabled={topicMutation !== null}>{tx("topicsCopy", "复制主题")}</button>
                        <button type="button" class="topic-action-danger" on:click={() => requestDeleteTopic(selectedTopic)} disabled={topicMutation !== null}>{tx("topicsDelete", "删除")}</button>
                    </div>
                </div>

                <div class="add-row">
                    <select bind:value={selectedInboxItemId} disabled={topicMutation !== null}>
                        <option value="">{tx("topicsSelectNote", "选择新增笔记")}</option>
                        {#each inboxItems as item (item.id)}
                            <option value={item.id}>{item.title} - {item.content || item.reviewContent}</option>
                        {/each}
                    </select>
                    <button type="button" on:click={addInboxItemToTopic} disabled={topicMutation !== null}>
                        {topicMutation === "add" ? tx("topicsAdding", "加入中...") : tx("topicsAdd", "加入主题")}
                    </button>
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
    .reading-page-embedded { max-width: none; margin: 0; padding: 0; }
    .page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
    h2, h3, p { margin: 0; }
    h2 { font-size: 20px; margin-bottom: 4px; }
    p { color: var(--b3-theme-on-surface-light, #666); font-size: 13px; line-height: 1.5; }
    button, select { border: 1px solid var(--b3-border-color, #e0e0e0); background: var(--b3-theme-surface, #fff); border-radius: 6px; padding: 6px 10px; font-size: 12px; }
    button { cursor: pointer; }
    button:disabled, select:disabled { cursor: default; opacity: .58; }
    button:focus-visible, select:focus-visible { outline: 2px solid var(--b3-theme-primary, #4CAF50); outline-offset: 1px; }
    .topic-layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 14px; }
    .topic-sidebar, .topic-main, .topic-card, .empty, article { background: var(--b3-theme-surface, #fff); border: 1px solid var(--b3-border-color, #e0e0e0); border-radius: 8px; }
    .topic-sidebar { display: flex; flex-direction: column; gap: 12px; min-width: 0; box-sizing: border-box; padding: 12px; }
    .topic-list { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .topic-list button { display: flex; width: 100%; justify-content: space-between; gap: 8px; text-align: left; }
    .topic-list button.active { color: var(--b3-theme-primary, #4CAF50); border-color: var(--b3-theme-primary, #4CAF50); }
    .topic-list-empty { padding: 4px 2px; color: var(--b3-theme-on-surface-light, #666); font-size: 12px; }
    .topic-sidebar-footer { margin-top: auto; }
    .topic-sidebar-footer button { width: 100%; min-height: 32px; }
    .topic-sidebar-footer button:hover { border-color: var(--b3-theme-primary, #4CAF50); background: var(--b3-theme-background, #f5f5f5); }
    .topic-sidebar-footer button:active { background: color-mix(in srgb, var(--b3-theme-primary, #4CAF50) 10%, var(--b3-theme-surface, #fff)); }
    .topic-sidebar-footer button:focus-visible { outline: 2px solid var(--b3-theme-primary, #4CAF50); outline-offset: 1px; }
    .topic-main { padding: 12px; }
    .topic-card, .add-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 12px; }
    .topic-card { padding: 12px; box-sizing: border-box; }
    .topic-card-content { flex: 1 1 220px; min-width: 0; }
    .topic-card h3, .topic-card p { overflow-wrap: anywhere; }
    .topic-actions { display: flex; flex: 0 1 auto; justify-content: flex-end; flex-wrap: wrap; gap: 6px; min-width: 0; }
    .topic-actions button:hover:not(:disabled) { background: var(--b3-theme-background, #f5f5f5); }
    .topic-action-secondary { color: var(--b3-theme-on-surface-light, #666); }
    .topic-action-danger { color: var(--b3-theme-error, #c0392b); border-color: color-mix(in srgb, var(--b3-theme-error, #c0392b) 45%, var(--b3-border-color, #e0e0e0)); }
    .topic-action-danger:hover:not(:disabled) { border-color: var(--b3-theme-error, #c0392b); background: color-mix(in srgb, var(--b3-theme-error, #c0392b) 8%, var(--b3-theme-surface, #fff)); }
    .add-row select { flex: 1; min-width: 0; }
    .empty { padding: 36px; text-align: center; color: var(--b3-theme-on-surface-light, #666); }
    .topic-items { display: flex; flex-direction: column; gap: 10px; }
    article { padding: 12px; }
    article p { color: var(--b3-theme-on-surface, #1a1a1a); }
    .comment { margin-top: 8px; font-size: 12px; color: var(--b3-theme-on-surface-light, #666); }
    .meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; color: var(--b3-theme-on-surface-light, #777); }
    @media (max-width: 800px) {
        .topic-layout { grid-template-columns: 1fr; }
        .topic-card, .add-row { align-items: stretch; flex-wrap: wrap; }
        .topic-actions { flex: 1 1 100%; justify-content: flex-start; }
        .add-row > select { flex-basis: 100%; }
    }
</style>

