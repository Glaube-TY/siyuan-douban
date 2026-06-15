<script lang="ts">
    import { onMount, createEventDispatcher } from "svelte";
    import { showMessage } from "siyuan";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import type { ReadingInboxStatus } from "../../types/readingInbox";
    import type { RecentNoteView } from "../../utils/readingManagement/types";
    import { buildRecentNoteViews } from "../../utils/readingManagement/managementData";
    import { openLocatedBlock, openSiyuanDoc } from "../../utils/readingManagement/blockLocator";
    import { markSourceInboxItemsProcessed, updateReadingInboxItemStatus } from "../../utils/storage/readingStorage";

    export let plugin: any;

    const dispatch = createEventDispatcher();

    type FilterKey =
        | "all"
        | ReadingInboxStatus
        | "bookmark"
        | "review"
        | "mp"
        | "indexed"
        | "missing";

    let views: RecentNoteView[] = [];
    let isLoading = true;
    let filter: FilterKey = "unprocessed";
    let bookFilter = "all";
    let sortMode: "syncedAt" | "createdAt" | "title" | "status" = "syncedAt";
    let selectedIds = new Set<string>();

    const filters: Array<{ key: FilterKey; label: string; icon?: string }> = [
        { key: "all", label: "全部" },
        { key: "unprocessed", label: "未处理" },
        { key: "later", label: "稍后" },
        { key: "processed", label: "已处理" },
        { key: "bookmark", label: "划线" },
        { key: "review", label: "评论" },
        { key: "mp", label: "公众号", icon: "officialAccount" },
        { key: "indexed", label: "已定位到块" },
        { key: "missing", label: "未定位到块" },
    ];

    onMount(loadItems);

    async function loadItems() {
        isLoading = true;
        try {
            views = await buildRecentNoteViews(plugin, { includeIgnored: true, status: "all" });
            selectedIds = new Set();
        } finally {
            isLoading = false;
        }
    }

    async function setStatus(view: RecentNoteView, status: ReadingInboxStatus) {
        await updateReadingInboxItemStatus(plugin, view.id, status);
        await loadItems();
        showMessage(`已标记为${statusText(status)}`);
    }

    async function batchSetStatus(status: ReadingInboxStatus) {
        const selected = visibleItems.filter((item) => selectedIds.has(item.id));
        if (selected.length === 0) {
            showMessage("请先选择笔记");
            return;
        }
        for (const item of selected) {
            await updateReadingInboxItemStatus(plugin, item.id, status);
        }
        await loadItems();
        showMessage(`已处理 ${selected.length} 条笔记`);
    }

    async function markBookProcessed(view: RecentNoteView) {
        await markSourceInboxItemsProcessed(plugin, view.sourceKey);
        await loadItems();
        showMessage("已标记该来源新增笔记为已处理");
    }

    function openBlock(view: RecentNoteView) {
        if (!view.locatedBlock) {
            showMessage("这条笔记还没有定位到对应的思源块。");
            return;
        }
        openLocatedBlock(plugin, view.locatedBlock);
    }

    function openItemDoc(view: RecentNoteView) {
        if (!view.noteDocId) {
            showMessage("该条目暂无可打开的本地笔记");
            return;
        }
        openSiyuanDoc(plugin, view.noteDocId);
    }

    async function copyQuote(view: RecentNoteView) {
        await copyText(buildQuoteText(view), "已复制引用");
    }

    async function copyMarkdown(view: RecentNoteView) {
        const parts = [
            `### ${view.title}`,
            view.sectionLabel ? `> ${view.sectionLabel}` : "",
            view.content ? `> ${view.content}` : "",
            view.comment ? `\n想法：${view.comment}` : "",
        ].filter(Boolean);
        await copyText(parts.join("\n\n"), "已复制 Markdown");
    }

    async function copySelectedQuotes() {
        const selected = visibleItems.filter((item) => selectedIds.has(item.id));
        if (selected.length === 0) {
            showMessage("请先选择笔记");
            return;
        }
        await copyText(selected.map(buildQuoteText).join("\n\n"), `已复制 ${selected.length} 条引用`);
    }

    async function copyRawDetails(view: RecentNoteView) {
        await copyText(JSON.stringify(view.rawItem, null, 2), "已复制原始详情");
    }

    async function copyText(text: string, successMessage: string) {
        try {
            await navigator.clipboard.writeText(text);
            showMessage(successMessage);
        } catch {
            showMessage("复制失败，请检查剪贴板权限");
        }
    }

    function addToTopic(view: RecentNoteView) {
        dispatch("addToTopic", { item: view.rawItem });
    }

    function toggleSelected(id: string) {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        selectedIds = next;
    }

    function toggleAllVisible() {
        if (visibleItems.length === 0) return;
        const allSelected = visibleItems.every((item) => selectedIds.has(item.id));
        selectedIds = allSelected ? new Set() : new Set(visibleItems.map((item) => item.id));
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

    function formatTime(ts?: number): string {
        return ts ? new Date(ts).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "--";
    }

    function buildQuoteText(view: RecentNoteView): string {
        const section = view.sectionLabel ? ` - ${view.sectionLabel}` : "";
        const body = view.comment || view.content || view.summary;
        return `《${view.title}》${section}\n${body}`;
    }

    $: bookOptions = Array.from(new Map(views.map((view) => [view.sourceKey, view.title])).entries())
        .sort((a, b) => a[1].localeCompare(b[1], "zh-CN"));

    $: filteredItems = views.filter((view) => {
        if (bookFilter !== "all" && view.sourceKey !== bookFilter) return false;
        if (filter === "all") return true;
        if (filter === "bookmark") return view.itemType === "bookmark" && view.sourceType !== "mp";
        if (filter === "review") return view.itemType === "review" && view.sourceType !== "mp";
        if (filter === "mp") return view.sourceType === "mp";
        if (filter === "indexed") return view.blockIndexed;
        if (filter === "missing") return !view.blockIndexed;
        return view.status === filter;
    });

    $: visibleItems = [...filteredItems].sort((a, b) => {
        if (sortMode === "title") return a.title.localeCompare(b.title, "zh-CN");
        if (sortMode === "status") return a.status.localeCompare(b.status);
        return (b.syncedAt || b.createdAt || 0) - (a.syncedAt || a.createdAt || 0);
    });

    $: selectedCount = visibleItems.filter((item) => selectedIds.has(item.id)).length;
</script>

<div class="reading-page">
    <div class="page-header">
        <button class="back-btn" on:click={() => dispatch("back")}>返回总览</button>
        <div>
            <h2>新增笔记收件箱</h2>
            <p>处理同步后新进入的划线、评论和公众号笔记</p>
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
            <select bind:value={bookFilter}>
                <option value="all">全部书籍</option>
                {#each bookOptions as [sourceKey, title] (sourceKey)}
                    <option value={sourceKey}>{title}</option>
                {/each}
            </select>
            <select bind:value={sortMode}>
                <option value="syncedAt">按同步时间</option>
                <option value="createdAt">按创建时间</option>
                <option value="title">按书名</option>
                <option value="status">按状态</option>
            </select>
        </div>
    </div>

    {#if visibleItems.length > 0}
        <div class="batch-toolbar">
            <label>
                <input type="checkbox" checked={selectedCount === visibleItems.length} on:change={toggleAllVisible} />
                <span>已选 {selectedCount} / {visibleItems.length}</span>
            </label>
            <button disabled={selectedCount === 0} on:click={() => batchSetStatus("processed")}>批量已处理</button>
            <button disabled={selectedCount === 0} on:click={() => batchSetStatus("later")}>批量稍后</button>
            <button disabled={selectedCount === 0} on:click={() => batchSetStatus("unprocessed")}>恢复未处理</button>
            <button disabled={selectedCount === 0} on:click={copySelectedQuotes}>复制引用</button>
            <button disabled={selectedCount === 0} on:click={() => showMessage("主题批量整理入口已预留，后续会接入主题页。")}>加入主题</button>
        </div>
    {/if}

    {#if isLoading}
        <div class="empty">加载中...</div>
    {:else if visibleItems.length === 0}
        <div class="empty">当前筛选下暂无新增笔记</div>
    {:else}
        <div class="inbox-list">
            {#each visibleItems as view (view.id)}
                <article class="inbox-item">
                    <div class="item-top">
                        <label class="select-box">
                            <input type="checkbox" checked={selectedIds.has(view.id)} on:change={() => toggleSelected(view.id)} />
                        </label>
                        <div class="item-main">
                            <div class="item-title-row">
                                <span class="type-badge">{view.typeLabel}</span>
                                <div class="item-title">{view.title}</div>
                                <span class="status-badge">{view.statusLabel}</span>
                            </div>
                            <div class="item-meta">
                                <span>{view.sourceType === "mp" ? "公众号" : "普通书"}</span>
                                <span>{view.sectionLabel || "未命名章节"}</span>
                                <span>同步：{formatTime(view.syncedAt)}</span>
                                <span class:block-ok={view.blockIndexed} class:block-missing={!view.blockIndexed}>{view.blockStatusLabel}</span>
                            </div>
                        </div>
                    </div>

                    <p class="content">{view.content || view.comment || "暂无内容"}</p>
                    {#if view.comment && view.comment !== view.content}
                        <p class="review">想法：{view.comment}</p>
                    {/if}

                    <div class="item-actions">
                        <button disabled={!view.blockIndexed} on:click={() => openBlock(view)}>打开思源块</button>
                        <button disabled={!view.noteDocId} on:click={() => openItemDoc(view)}>打开所在文档</button>
                        <button on:click={() => setStatus(view, "processed")}>标记已处理</button>
                        <button on:click={() => setStatus(view, "later")}>稍后处理</button>
                        <button on:click={() => setStatus(view, "unprocessed")}>恢复未处理</button>
                        <button on:click={() => copyQuote(view)}>复制引用</button>
                        <button on:click={() => copyMarkdown(view)}>复制 Markdown</button>
                        <button on:click={() => copyRawDetails(view)}>原始详情</button>
                        <button on:click={() => addToTopic(view)}>加入主题</button>
                        <button on:click={() => markBookProcessed(view)}>处理整本</button>
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
    .item-actions button,
    .batch-toolbar button {
        border: 1px solid var(--b3-border-color, #e0e0e0);
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #1a1a1a);
        border-radius: 6px;
        padding: 6px 10px;
        cursor: pointer;
        font-size: 12px;
    }

    .item-actions button:disabled,
    .batch-toolbar button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .subpage-toolbar,
    .batch-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 10px;
        background: var(--b3-theme-surface, #fff);
        box-sizing: border-box;
        margin-bottom: 14px;
    }

    .batch-toolbar {
        justify-content: flex-start;
    }

    .batch-toolbar label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-right: 6px;
        font-size: 12px;
        color: var(--b3-theme-on-surface-light, #666);
    }

    .subpage-toolbar-group {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        flex: 1 1 520px;
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
        border: 1px solid var(--b3-border-color, #e0e0e0);
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #1a1a1a);
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
    }

    .subpage-toolbar-group button.active {
        color: #fff;
        background: var(--b3-theme-primary, #4CAF50);
        border-color: var(--b3-theme-primary, #4CAF50);
    }

    .subpage-toolbar-extra {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .subpage-toolbar select {
        height: 32px;
        min-width: 140px;
        max-width: 220px;
        box-sizing: border-box;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        background: var(--b3-theme-surface, #fff);
        border-radius: 6px;
        padding: 0 8px;
        font-size: 12px;
        color: var(--b3-theme-on-surface, #1a1a1a);
    }

    .empty {
        padding: 48px;
        text-align: center;
        background: var(--b3-theme-surface, #fff);
        border: 1px solid var(--b3-border-color, #e0e0e0);
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
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 8px;
        padding: 14px;
    }

    .item-top {
        display: flex;
        gap: 10px;
        align-items: flex-start;
    }

    .select-box {
        padding-top: 2px;
        flex-shrink: 0;
    }

    .item-main {
        min-width: 0;
        flex: 1;
    }

    .item-title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
    }

    .item-title {
        min-width: 0;
        font-weight: 700;
        font-size: 14px;
        overflow-wrap: anywhere;
    }

    .item-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 5px;
        color: var(--b3-theme-on-surface-light, #777);
        font-size: 12px;
    }

    .type-badge,
    .status-badge {
        flex-shrink: 0;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 11px;
        color: var(--b3-theme-primary, #4CAF50);
        background: color-mix(in srgb, var(--b3-theme-primary, #4CAF50) 12%, transparent);
        white-space: nowrap;
    }

    .status-badge {
        color: var(--b3-theme-on-surface-light, #666);
        background: var(--b3-theme-background, #f5f5f5);
    }

    .block-ok {
        color: var(--b3-theme-success, #4CAF50);
    }

    .block-missing {
        color: var(--b3-card-warning-color, #FF9800);
    }

    .content,
    .review {
        margin: 10px 0 0;
        line-height: 1.55;
        font-size: 13px;
        overflow-wrap: anywhere;
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

    @media (max-width: 720px) {
        .subpage-toolbar-group,
        .subpage-toolbar-extra,
        .subpage-toolbar select {
            flex-basis: 100%;
            width: 100%;
            max-width: none;
        }
    }
</style>
