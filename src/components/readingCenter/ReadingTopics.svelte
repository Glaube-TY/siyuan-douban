<script lang="ts">
    import { onDestroy, onMount, createEventDispatcher } from "svelte";
    import { showMessage } from "siyuan";
    import { confirmDialog, svelteDialog } from "../../libs/dialog";
    import type { ReadingTopic, ReadingTopicItem } from "../../types/readingTopic";
    import type { ReadingInboxItem } from "../../types/readingInbox";
    import type { ReadingTopicNoteSearchResult } from "../../utils/readingCenter/readingTopicNoteSearchService";
    import { getReadingTopicItems, getReadingTopics } from "../../utils/storage/readingStorage";
    import { openSiyuanBlock, openSiyuanDoc } from "../../utils/readingManagement/blockLocator";
    import {
        assignReadingAnnotationToTopic,
        deleteReadingTopic,
        reorderReadingTopic,
    } from "../../utils/readingCenter/readingTopicService";
    import { t } from "../../utils/i18n";
    import ReadingTopicCreateDialog from "./ReadingTopicCreateDialog.svelte";
    import ReadingTopicMembershipConflictDialog from "./ReadingTopicMembershipConflictDialog.svelte";
    import ReadingTopicNoteSearch from "./ReadingTopicNoteSearch.svelte";

    export let plugin: any;
    export let pendingInboxItem: ReadingInboxItem | null = null;
    export let embedded = false;

    const dispatch = createEventDispatcher<{ back: void; pendingItemConsumed: void }>();
    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) => t(plugin, key, fallback, params);

    let topics: ReadingTopic[] = [];
    let topicItems: ReadingTopicItem[] = [];
    let searchResetKey = 0;
    let selectedTopicId = "";
    let topicMutation: "add" | "reorder" | "delete" | null = null;
    let draggedTopicId = "";
    let dragSourceIndex = -1;
    let dragInsertionIndex: number | null = null;
    let dragPointerId: number | null = null;
    let dragging = false;

    onMount(loadAll);
    onDestroy(cleanupTopicDrag);

    async function loadAll() {
        topics = await getReadingTopics(plugin);
        topicItems = await getReadingTopicItems(plugin);
        if (!selectedTopicId && topics[0]) selectedTopicId = topics[0].id;
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

    function handleTopicNoteAssign(event: CustomEvent<ReadingTopicNoteSearchResult>): void {
        if (topicMutation || dragging || !selectedTopic) return;
        const result = event.detail;
        if (result.topicIds.includes(selectedTopic.id)) return;

        const otherTopicNames = result.topicIds
            .filter((topicId) => topicId !== selectedTopic.id)
            .map((topicId) => topics.find((topic) => topic.id === topicId)?.name)
            .filter((name): name is string => !!name);
        if (otherTopicNames.length > 0) {
            openMembershipConflictDialog(selectedTopic, result, otherTopicNames);
            return;
        }
        void assignTopicNote(selectedTopic.id, result, "keep_other_topics");
    }

    function openMembershipConflictDialog(
        topic: ReadingTopic,
        result: ReadingTopicNoteSearchResult,
        otherTopicNames: string[],
    ): void {
        let dialogRef: any;
        const isMobileViewport = typeof window !== "undefined"
            && (window.matchMedia?.("(max-width: 600px)").matches || window.innerWidth <= 600);
        try {
            dialogRef = svelteDialog({
                title: tx("topicsMembershipConflictTitle", "笔记已属于其他主题"),
                width: isMobileViewport ? "100vw" : "min(560px, 92vw)",
                height: isMobileViewport ? "100dvh" : undefined,
                disableClose: true,
                hideCloseIcon: true,
                constructor: (container: HTMLElement) => new ReadingTopicMembershipConflictDialog({
                    target: container,
                    props: {
                        plugin,
                        topicNames: otherTopicNames,
                        currentTopicName: topic.name,
                        close: () => dialogRef?.close?.(),
                        onKeep: () => void assignTopicNote(topic.id, result, "keep_other_topics"),
                        onMove: () => void assignTopicNote(topic.id, result, "move_to_topic"),
                    },
                }),
            });
            if (isMobileViewport) {
                dialogRef.dialog.element.classList.add("siyuan-douban-mobile-subdialog");
            }
        } catch (error: any) {
            showMessage(tx("topicsAddFailed", "加入主题失败：{error}", {
                error: error?.message || String(error) || tx("uiUnknownError", "未知错误"),
            }));
        }
    }

    async function assignTopicNote(
        topicId: string,
        result: ReadingTopicNoteSearchResult,
        mode: "keep_other_topics" | "move_to_topic",
    ): Promise<void> {
        if (topicMutation) return;
        topicMutation = "add";
        try {
            const assignment = await assignReadingAnnotationToTopic(plugin, topicId, result.annotation, {
                mode,
                knownMembershipItemIds: result.topicItemIds,
            });
            topicItems = assignment.topicItems;
            searchResetKey += 1;
            if (assignment.removedFromTopicIds.length > 0) {
                showMessage(tx("topicsMovedToCurrent", "已移动到主题「{topic}」", { topic: assignment.topic.name }));
            } else if (assignment.added) {
                showMessage(tx("topicsAddedToCurrent", "已加入主题「{topic}」", { topic: assignment.topic.name }));
            } else if (assignment.alreadyExists) {
                showMessage(tx("topicsAlreadyInCurrent", "已在当前主题"));
            }
            if (result.isPending) {
                pendingInboxItem = null;
                dispatch("pendingItemConsumed");
            }
        } catch (error: any) {
            showMessage(tx("topicsAddFailed", "加入主题失败：{error}", {
                error: error?.message || String(error) || tx("uiUnknownError", "未知错误"),
            }));
        } finally {
            topicMutation = null;
        }
    }

    function cleanupTopicDrag(): void {
        draggedTopicId = "";
        dragSourceIndex = -1;
        dragInsertionIndex = null;
        dragPointerId = null;
        dragging = false;
    }

    function getDragTargetIndex(): number | null {
        if (dragSourceIndex < 0 || dragInsertionIndex === null || topics.length === 0) return null;
        const boundedInsertionIndex = Math.max(0, Math.min(dragInsertionIndex, topics.length));
        const targetIndex = boundedInsertionIndex > dragSourceIndex
            ? boundedInsertionIndex - 1
            : boundedInsertionIndex;
        return Math.max(0, Math.min(targetIndex, topics.length - 1));
    }

    async function reorderTopicToIndex(topicId: string, targetIndex: number): Promise<void> {
        if (topicMutation) return;

        topicMutation = "reorder";
        try {
            const result = await reorderReadingTopic(plugin, topicId, targetIndex);
            topics = result.topics;
        } catch (error: any) {
            showMessage(tx("topicsReorderFailed", "主题排序失败：{error}", {
                error: error?.message || String(error) || tx("uiUnknownError", "未知错误"),
            }));
        } finally {
            topicMutation = null;
            cleanupTopicDrag();
        }
    }

    function handleTopicHandleKeydown(event: KeyboardEvent, topic: ReadingTopic): void {
        if (
            !event.altKey
            || (event.key !== "ArrowUp" && event.key !== "ArrowDown")
            || topicMutation
            || dragging
        ) return;

        event.preventDefault();
        const sourceIndex = topics.findIndex((item) => item.id === topic.id);
        if (sourceIndex < 0) return;
        void reorderTopicToIndex(topic.id, sourceIndex + (event.key === "ArrowUp" ? -1 : 1));
    }

    function handleTopicPointerDown(event: PointerEvent, topic: ReadingTopic): void {
        if (event.button !== 0 || topicMutation || dragging) return;

        const sourceIndex = topics.findIndex((item) => item.id === topic.id);
        if (sourceIndex < 0) return;

        event.preventDefault();
        draggedTopicId = topic.id;
        dragSourceIndex = sourceIndex;
        dragInsertionIndex = sourceIndex;
        dragPointerId = event.pointerId;
        dragging = true;
        try {
            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        } catch {
            cleanupTopicDrag();
        }
    }

    function handleTopicPointerMove(event: PointerEvent): void {
        if (!dragging || event.pointerId !== dragPointerId) return;

        event.preventDefault();
        const handle = event.currentTarget as HTMLElement;
        const list = handle.closest(".topic-list");
        if (!list) return;
        const listRect = list.getBoundingClientRect();
        if (
            event.clientX < listRect.left
            || event.clientX > listRect.right
            || event.clientY < listRect.top
            || event.clientY > listRect.bottom
        ) return;

        const rows = Array.from(list.querySelectorAll<HTMLElement>(".topic-list-row"));
        if (rows.length === 0) return;
        const targetIndex = rows.findIndex((row) => {
            const rect = row.getBoundingClientRect();
            return event.clientY < rect.top + rect.height / 2;
        });
        dragInsertionIndex = targetIndex < 0 ? topics.length : targetIndex;
    }

    async function handleTopicPointerUp(event: PointerEvent): Promise<void> {
        if (!dragging || event.pointerId !== dragPointerId) return;

        const handle = event.currentTarget as HTMLElement;
        try {
            if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        } catch {
            // Pointer capture may already be released by the browser.
        }

        const topicId = draggedTopicId;
        const sourceIndex = dragSourceIndex;
        const targetIndex = getDragTargetIndex();
        cleanupTopicDrag();
        if (!topicId || sourceIndex < 0 || targetIndex === null || targetIndex === sourceIndex) return;
        await reorderTopicToIndex(topicId, targetIndex);
    }

    function handleTopicPointerCancel(event: PointerEvent): void {
        if (!dragging || event.pointerId !== dragPointerId) return;

        const handle = event.currentTarget as HTMLElement;
        try {
            if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        } catch {
            // Pointer capture may already be released by the browser.
        }
        cleanupTopicDrag();
    }

    function requestDeleteTopic(topic: ReadingTopic) {
        if (topicMutation || dragging) return;

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
    $: topicInteractionLocked = topicMutation !== null || dragging;
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
                    {#each topics as topic, index (topic.id)}
                        <div
                            class="topic-list-row"
                            class:active={selectedTopicId === topic.id}
                            class:dragging-row={dragging && draggedTopicId === topic.id}
                            class:drop-before={dragging && dragInsertionIndex === index}
                            class:drop-after={dragging && dragInsertionIndex === topics.length && index === topics.length - 1}
                        >
                            <button
                                type="button"
                                class="topic-drag-handle"
                                aria-label={tx("topicsDragHandle", "拖动主题「{topic}」排序", { topic: topic.name })}
                                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                                title={tx("topicsDragTitle", "拖动排序")}
                                disabled={topicMutation !== null || (dragging && draggedTopicId !== topic.id)}
                                on:pointerdown={(event) => handleTopicPointerDown(event, topic)}
                                on:pointermove={handleTopicPointerMove}
                                on:pointerup={handleTopicPointerUp}
                                on:pointercancel={handleTopicPointerCancel}
                                on:keydown={(event) => handleTopicHandleKeydown(event, topic)}
                            >
                                <span class="topic-drag-grip" aria-hidden="true">
                                    <span></span><span></span><span></span>
                                    <span></span><span></span><span></span>
                                </span>
                            </button>
                            <button
                                type="button"
                                class="topic-select-button"
                                on:click={() => (selectedTopicId = topic.id)}
                                disabled={topicInteractionLocked}
                            >
                                <span>{topic.name}</span>
                                <small>{tx("topicsItemCount", "{count} 条", { count: topicItems.filter((item) => item.topicId === topic.id).length })}</small>
                            </button>
                        </div>
                    {/each}
                {/if}
            </div>

            <div class="topic-sidebar-footer">
                <button type="button" on:click={openCreateTopicDialog} disabled={topicInteractionLocked}>{tx("topicsAddTopic", "添加主题")}</button>
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
                        <button type="button" on:click={() => copyTopic(selectedTopic)} disabled={topicInteractionLocked}>{tx("topicsCopy", "复制主题")}</button>
                        <button type="button" class="topic-action-danger" on:click={() => requestDeleteTopic(selectedTopic)} disabled={topicInteractionLocked}>{tx("topicsDelete", "删除")}</button>
                    </div>
                </div>

                <ReadingTopicNoteSearch
                    plugin={plugin}
                    currentTopicId={selectedTopic.id}
                    topics={topics}
                    topicItems={topicItems}
                    pendingInboxItem={pendingInboxItem}
                    resetKey={searchResetKey}
                    disabled={topicInteractionLocked}
                    on:assign={handleTopicNoteAssign}
                />

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
    button { border: 1px solid var(--b3-border-color, #e0e0e0); background: var(--b3-theme-surface, #fff); border-radius: 6px; padding: 6px 10px; font-size: 12px; }
    button { cursor: pointer; }
    button:disabled { cursor: default; opacity: .58; }
    button:focus-visible { outline: 2px solid var(--b3-theme-primary, #4CAF50); outline-offset: 1px; }
    .topic-layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 14px; }
    .topic-sidebar, .topic-main, .topic-card, .empty, article { background: var(--b3-theme-surface, #fff); border: 1px solid var(--b3-border-color, #e0e0e0); border-radius: 8px; }
    .topic-sidebar { display: flex; flex-direction: column; gap: 12px; min-width: 0; box-sizing: border-box; padding: 12px; }
    .topic-list { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .topic-list-row { position: relative; display: flex; align-items: stretch; gap: 2px; width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid var(--b3-border-color, #e0e0e0); border-radius: 6px; background: var(--b3-theme-surface, #fff); }
    .topic-list-row.active { color: var(--b3-theme-primary, #4CAF50); border-color: var(--b3-theme-primary, #4CAF50); background: color-mix(in srgb, var(--b3-theme-primary, #4CAF50) 6%, var(--b3-theme-surface, #fff)); }
    .topic-list-row.dragging-row { opacity: .62; }
    .topic-drag-handle { display: flex; flex: 0 0 32px; align-items: center; justify-content: center; min-height: 32px; padding: 0; border: 0; border-radius: 5px; color: var(--b3-theme-on-surface-light, #666); background: transparent; cursor: grab; touch-action: none; user-select: none; }
    .topic-drag-handle:hover:not(:disabled), .topic-drag-handle:focus-visible { color: var(--b3-theme-on-surface, #1a1a1a); background: var(--b3-theme-background, #f5f5f5); }
    .topic-drag-handle:active, .topic-list-row.dragging-row .topic-drag-handle { cursor: grabbing; }
    .topic-drag-grip { display: grid; grid-template-columns: repeat(2, 3px); grid-template-rows: repeat(3, 3px); gap: 3px; }
    .topic-drag-grip span { width: 3px; height: 3px; border-radius: 50%; background: currentColor; }
    .topic-select-button { display: flex; flex: 1 1 auto; justify-content: space-between; align-items: center; gap: 8px; min-width: 0; min-height: 32px; padding: 6px 8px 6px 4px; border: 0; border-radius: 5px; color: inherit; background: transparent; text-align: left; }
    .topic-select-button:hover:not(:disabled) { background: var(--b3-theme-background, #f5f5f5); }
    .topic-select-button > span { min-width: 0; overflow-wrap: anywhere; }
    .topic-select-button small { flex: 0 0 auto; }
    .topic-list-row.drop-before::before, .topic-list-row.drop-after::after { content: ""; position: absolute; left: 2px; right: 2px; z-index: 1; height: 2px; border-radius: 1px; background: var(--b3-theme-primary, #4CAF50); pointer-events: none; }
    .topic-list-row.drop-before::before { top: -4px; }
    .topic-list-row.drop-after::after { bottom: -4px; }
    .topic-list-empty { padding: 4px 2px; color: var(--b3-theme-on-surface-light, #666); font-size: 12px; }
    .topic-sidebar-footer { margin-top: auto; }
    .topic-sidebar-footer button { width: 100%; min-height: 32px; }
    .topic-sidebar-footer button:hover { border-color: var(--b3-theme-primary, #4CAF50); background: var(--b3-theme-background, #f5f5f5); }
    .topic-sidebar-footer button:active { background: color-mix(in srgb, var(--b3-theme-primary, #4CAF50) 10%, var(--b3-theme-surface, #fff)); }
    .topic-sidebar-footer button:focus-visible { outline: 2px solid var(--b3-theme-primary, #4CAF50); outline-offset: 1px; }
    .topic-main { padding: 12px; }
    .topic-card { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 12px; }
    .topic-card { padding: 12px; box-sizing: border-box; }
    .topic-card-content { flex: 1 1 220px; min-width: 0; }
    .topic-card h3, .topic-card p { overflow-wrap: anywhere; }
    .topic-actions { display: flex; flex: 0 1 auto; justify-content: flex-end; flex-wrap: wrap; gap: 6px; min-width: 0; }
    .topic-actions button:hover:not(:disabled) { background: var(--b3-theme-background, #f5f5f5); }
    .topic-action-danger { color: var(--b3-theme-error, #c0392b); border-color: color-mix(in srgb, var(--b3-theme-error, #c0392b) 45%, var(--b3-border-color, #e0e0e0)); }
    .topic-action-danger:hover:not(:disabled) { border-color: var(--b3-theme-error, #c0392b); background: color-mix(in srgb, var(--b3-theme-error, #c0392b) 8%, var(--b3-theme-surface, #fff)); }
    .empty { padding: 36px; text-align: center; color: var(--b3-theme-on-surface-light, #666); }
    .topic-items { display: flex; flex-direction: column; gap: 10px; }
    article { padding: 12px; }
    article p { color: var(--b3-theme-on-surface, #1a1a1a); }
    .comment { margin-top: 8px; font-size: 12px; color: var(--b3-theme-on-surface-light, #666); }
    .meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; color: var(--b3-theme-on-surface-light, #777); }
    @media (max-width: 800px) {
        .topic-layout { grid-template-columns: 1fr; }
        .topic-card { align-items: stretch; flex-wrap: wrap; }
        .topic-actions { flex: 1 1 100%; justify-content: flex-start; }
    }
</style>

