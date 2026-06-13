<script lang="ts">
    import { onMount, createEventDispatcher } from "svelte";
    import { showMessage } from "siyuan";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import type { ReadingInboxItem, ReadingInboxStatus } from "../../types/readingInbox";
    import { getReadingInboxItems, markSourceInboxItemsProcessed, updateReadingInboxItemStatus } from "../../utils/storage/readingStorage";
    import { openDoc } from "../../utils/openDoc";

    export let plugin: any;

    const dispatch = createEventDispatcher();

    let items: ReadingInboxItem[] = [];
    let isLoading = true;
    let filter: ReadingInboxStatus | "all" | "book" | "mp" = "unprocessed";
    let sortMode: "time" | "book" | "source" = "time";

    type FilterKey = ReadingInboxStatus | "all" | "book" | "mp";
    const filters: Array<{ key: FilterKey; label: string; icon?: string }> = [
        { key: "all", label: "全部" },
        { key: "unprocessed", label: "未处理" },
        { key: "later", label: "稍后处理" },
        { key: "processed", label: "已处理" },
        { key: "ignored", label: "已忽略" },
        { key: "book", label: "普通书", icon: "book" },
        { key: "mp", label: "公众号", icon: "officialAccount" },
    ];

    onMount(loadItems);

    async function loadItems() {
        isLoading = true;
        try {
            items = await getReadingInboxItems(plugin);
        } finally {
            isLoading = false;
        }
    }

    async function setStatus(item: ReadingInboxItem, status: ReadingInboxStatus) {
        await updateReadingInboxItemStatus(plugin, item.id, status);
        await loadItems();
    }

    async function markBookProcessed(item: ReadingInboxItem) {
        await markSourceInboxItemsProcessed(plugin, item.sourceKey);
        await loadItems();
        showMessage("已标记该来源新增笔记为已处理");
    }

    function openItem(item: ReadingInboxItem) {
        if (!item.noteDocId) {
            showMessage("该条目暂无可打开的本地笔记");
            return;
        }
        openDoc(plugin, item.noteDocId, 1);
    }

    async function copyItem(item: ReadingInboxItem) {
        const parts = [
            `# ${item.title}`,
            item.chapterTitle || item.articleTitle || "",
            item.content,
            item.reviewContent ? `想法：${item.reviewContent}` : "",
        ].filter(Boolean);
        try {
            await navigator.clipboard.writeText(parts.join("\n\n"));
            showMessage("已复制内容");
        } catch {
            showMessage("复制失败，请检查剪贴板权限");
        }
    }

    function addToTopic(item: ReadingInboxItem) {
        dispatch("addToTopic", { item });
    }

    function statusText(status: ReadingInboxStatus): string {
        const map: Record<ReadingInboxStatus, string> = {
            unprocessed: "未处理",
            processed: "已处理",
            ignored: "已忽略",
            later: "稍后",
        };
        return map[status];
    }

    function formatTime(ts: number): string {
        return new Date(ts).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    }

    $: filteredItems = items.filter((item) => {
        if (filter === "all") return true;
        if (filter === "book") return item.sourceType === "weread-book";
        if (filter === "mp") return item.sourceType === "weread-mp";
        return item.status === filter;
    });

    $: visibleItems = [...filteredItems].sort((a, b) => {
        if (sortMode === "book") return a.title.localeCompare(b.title, "zh-CN");
        if (sortMode === "source") return a.sourceType.localeCompare(b.sourceType);
        return b.createdAt - a.createdAt;
    });
</script>

<div class="reading-page">
    <div class="page-header">
        <button class="back-btn" on:click={() => dispatch("back")}>返回总览</button>
        <div>
            <h2>新增笔记收件箱</h2>
            <p>集中处理同步后新增的划线、想法和公众号笔记</p>
        </div>
    </div>

    <div class="subpage-toolbar">
        <div class="subpage-toolbar-group">
            {#each filters as option (option.key)}
                <button class:active={filter === option.key} on:click={() => (filter = option.key)}>
                    {#if option.icon}
                        <SiYuanIcon name={option.icon} pluginName={plugin.name} size={13} />
                    {/if}
                    <span>{option.label}</span>
                </button>
            {/each}
        </div>
        <div class="subpage-toolbar-extra">
            <select bind:value={sortMode}>
                <option value="time">按同步时间</option>
                <option value="book">按书籍</option>
                <option value="source">按来源类型</option>
            </select>
        </div>
    </div>

    {#if isLoading}
        <div class="empty">加载中...</div>
    {:else if visibleItems.length === 0}
        <div class="empty">暂无新增笔记</div>
    {:else}
        <div class="inbox-list">
            {#each visibleItems as item (item.id)}
                <article class="inbox-item">
                    <div class="item-top">
                        <div>
                            <div class="item-title">{item.title}</div>
                            <div class="item-meta">
                                <span>{item.sourceType === "weread-mp" ? "公众号" : "普通书"}</span>
                                <span>{item.articleTitle || item.chapterTitle || "未命名章节"}</span>
                                <span>{formatTime(item.createdAt)}</span>
                            </div>
                        </div>
                        <span class="status-badge">{statusText(item.status)}</span>
                    </div>
                    <p class="content">{item.content || item.reviewContent || "暂无内容"}</p>
                    {#if item.reviewContent && item.reviewContent !== item.content}
                        <p class="review">想法：{item.reviewContent}</p>
                    {/if}
                    <div class="item-actions">
                        <button on:click={() => openItem(item)}>打开原笔记</button>
                        <button on:click={() => setStatus(item, "processed")}>标记已处理</button>
                        <button on:click={() => setStatus(item, "later")}>稍后处理</button>
                        <button on:click={() => setStatus(item, "ignored")}>忽略</button>
                        <button on:click={() => copyItem(item)}>复制内容</button>
                        <button on:click={() => addToTopic(item)}>加入主题</button>
                        <button on:click={() => markBookProcessed(item)}>处理整本</button>
                    </div>
                </article>
            {/each}
        </div>
    {/if}
</div>

<style>
    .reading-page {
        max-width: 1180px;
        margin: 0 auto;
        padding: clamp(16px, 2vw, 28px);
    }

    .page-header {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 16px;
    }

    .page-header h2 {
        margin: 0 0 4px 0;
        font-size: 20px;
    }

    .page-header p {
        margin: 0;
        color: var(--b3-theme-on-surface-light, #666);
        font-size: 13px;
    }

    .back-btn,
    .item-actions button {
        border: 1px solid var(--b3-theme-border, #e0e0e0);
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #1a1a1a);
        border-radius: 6px;
        padding: 6px 10px;
        cursor: pointer;
        font-size: 12px;
    }

    .subpage-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px;
        height: auto;
        min-height: unset;
        overflow: visible;
        border: 1px solid var(--b3-theme-border, #e0e0e0);
        border-radius: 10px;
        background: var(--b3-theme-surface, #fff);
        box-sizing: border-box;
        margin-bottom: 14px;
    }

    .subpage-toolbar-group {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        flex: 1 1 420px;
        min-width: 0;
    }

    .subpage-toolbar-group button {
        height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 12px;
        border-radius: 999px;
        box-sizing: border-box;
        border: 1px solid var(--b3-theme-border, #e0e0e0);
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #1a1a1a);
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
        transition: border-color 0.15s, color 0.15s, background 0.15s;
    }

    .subpage-toolbar-group button.active {
        color: var(--b3-theme-on-primary, #fff);
        background: var(--b3-theme-primary, #4CAF50);
        border-color: var(--b3-theme-primary, #4CAF50);
    }

    .subpage-toolbar-extra {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .subpage-toolbar select {
        flex: 0 0 150px;
        height: 32px;
        box-sizing: border-box;
        border: 1px solid var(--b3-theme-border, #e0e0e0);
        background: var(--b3-theme-surface, #fff);
        border-radius: 6px;
        padding: 0 8px;
        font-size: 12px;
        color: var(--b3-theme-on-surface, #1a1a1a);
    }

    @media (max-width: 720px) {
        .subpage-toolbar-group {
            flex-basis: 100%;
        }
        .subpage-toolbar select {
            flex: 1 1 100%;
            width: 100%;
        }
    }

    .empty {
        padding: 48px;
        text-align: center;
        background: var(--b3-theme-surface, #fff);
        border: 1px solid var(--b3-theme-border, #e0e0e0);
        border-radius: 8px;
        color: var(--b3-theme-on-surface-light, #666);
    }

    .inbox-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .inbox-item {
        background: var(--b3-theme-surface, #fff);
        border: 1px solid var(--b3-theme-border, #e0e0e0);
        border-radius: 8px;
        padding: 14px;
    }

    .item-top {
        display: flex;
        justify-content: space-between;
        gap: 12px;
    }

    .item-title {
        font-weight: 700;
        font-size: 14px;
    }

    .item-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 4px;
        color: var(--b3-theme-on-surface-light, #777);
        font-size: 12px;
    }

    .status-badge {
        height: fit-content;
        border-radius: 999px;
        padding: 3px 8px;
        font-size: 11px;
        color: var(--b3-theme-primary, #4CAF50);
        background: color-mix(in srgb, var(--b3-theme-primary, #4CAF50) 12%, transparent);
        white-space: nowrap;
    }

    .content,
    .review {
        margin: 10px 0 0;
        line-height: 1.55;
        font-size: 13px;
    }

    .review {
        color: var(--b3-theme-on-surface-light, #666);
    }

    .item-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
    }
</style>

