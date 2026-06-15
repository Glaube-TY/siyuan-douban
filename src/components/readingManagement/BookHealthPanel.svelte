<script lang="ts">
    import { onMount, createEventDispatcher } from "svelte";
    import { showMessage } from "siyuan";
    import type { WorkbenchAction } from "../../types/workbench";
    import type { BookHealthView } from "../../utils/readingManagement/types";
    import { buildBookHealthViews } from "../../utils/readingManagement/managementData";
    import { openSiyuanDoc } from "../../utils/readingManagement/blockLocator";

    export let plugin: any;

    const dispatch = createEventDispatcher<{ back: void; action: WorkbenchAction }>();

    let items: BookHealthView[] = [];
    let isLoading = true;
    let filter: "all" | "healthy" | "new" | "unbound" | "failed" | "indexMissing" | "indexBroken" | "book" | "mp" = "all";

    const filters = [
        { key: "all", label: "全部" },
        { key: "healthy", label: "健康" },
        { key: "new", label: "有新增" },
        { key: "unbound", label: "未绑定" },
        { key: "failed", label: "同步失败" },
        { key: "indexMissing", label: "索引未建立" },
        { key: "indexBroken", label: "索引异常" },
        { key: "book", label: "普通书" },
        { key: "mp", label: "公众号" },
    ] as const;

    onMount(async () => {
        try {
            items = await buildBookHealthViews(plugin);
        } finally {
            isLoading = false;
        }
    });

    function matchFilter(item: BookHealthView): boolean {
        if (filter === "all") return true;
        if (filter === "healthy") return item.level === "healthy";
        if (filter === "new") return item.inboxPendingCount > 0;
        if (filter === "unbound") return !item.bound;
        if (filter === "failed") return item.reasons.includes("sync_failed");
        if (filter === "indexMissing") return item.indexStatus === "missing";
        if (filter === "indexBroken") return item.indexStatus === "broken";
        if (filter === "book") return item.sourceType === "book";
        if (filter === "mp") return item.sourceType === "mp";
        return true;
    }

    function openDoc(item: BookHealthView) {
        if (!item.noteDocId) {
            showMessage("该书暂无可打开的本地笔记");
            return;
        }
        openSiyuanDoc(plugin, item.noteDocId);
    }

    function formatTime(ts?: number): string {
        return ts ? new Date(ts).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "--";
    }

    $: visibleItems = items.filter(matchFilter);
</script>

<div class="reading-management-page">
    <div class="page-header">
        <button class="back-btn" on:click={() => dispatch("back")}>返回总览</button>
        <div>
            <h2>书籍健康检查</h2>
            <p>按书查看绑定、同步、块级索引和新增笔记状态</p>
        </div>
    </div>

    <div class="filter-bar">
        {#each filters as option (option.key)}
            <button class:active={filter === option.key} on:click={() => (filter = option.key)}>{option.label}</button>
        {/each}
    </div>

    {#if isLoading}
        <div class="empty">加载中...</div>
    {:else if visibleItems.length === 0}
        <div class="empty">当前筛选下暂无书籍</div>
    {:else}
        <div class="health-grid">
            {#each visibleItems as item (item.id)}
                <article class="health-card level-{item.level}">
                    <div class="card-head">
                        <div>
                            <h3>{item.title}</h3>
                            <p>{item.sourceLabel} · 最近同步 {formatTime(item.lastSyncTime)}</p>
                        </div>
                        <span class="level-pill">{item.levelLabel}</span>
                    </div>
                    <div class="badges">
                        <span>{item.bound ? "已绑定文档" : "未绑定文档"}</span>
                        <span>索引：{item.indexStatusLabel}</span>
                        <span>新增笔记 {item.inboxPendingCount}</span>
                        <span>新增 {item.addedItemCount} / 更新 {item.changedItemCount} / 删除 {item.deletedItemCount}</span>
                    </div>
                    <p class="reason">{item.reasonLabels.join(" / ")}</p>
                    <p class="suggestion">{item.recommendedAction}</p>
                    <div class="actions">
                        <button disabled={!item.noteDocId} on:click={() => openDoc(item)}>打开笔记文档</button>
                        <button on:click={() => dispatch("action", "open-sync-changes")}>打开同步报告</button>
                        <button on:click={() => dispatch("action", "open-inbox")}>打开新增笔记</button>
                        <button on:click={() => showMessage(`索引状态：${item.indexStatusLabel}`)}>查看块索引</button>
                    </div>
                </article>
            {/each}
        </div>
    {/if}
</div>

<style>
    .reading-management-page {
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

    .page-header div {
        flex: 1;
        min-width: 0;
    }

    h2,
    h3,
    p {
        margin: 0;
    }

    h2 {
        font-size: 20px;
        margin-bottom: 4px;
    }

    h3 {
        font-size: 14px;
        margin-bottom: 4px;
    }

    .page-header p,
    .card-head p,
    .reason,
    .suggestion {
        color: var(--b3-theme-on-surface-light, #666);
        font-size: 13px;
    }

    .back-btn,
    .filter-bar button,
    .actions button {
        border: 1px solid var(--b3-border-color, #e0e0e0);
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #1a1a1a);
        border-radius: 6px;
        padding: 6px 10px;
        cursor: pointer;
        font-size: 12px;
    }

    .actions button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .filter-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 8px;
        margin-bottom: 14px;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 10px;
        background: var(--b3-theme-surface, #fff);
    }

    .filter-bar button.active {
        color: #fff;
        background: var(--b3-theme-primary, #4CAF50);
        border-color: var(--b3-theme-primary, #4CAF50);
    }

    .health-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 10px;
    }

    .health-card,
    .empty {
        background: var(--b3-theme-surface, #fff);
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 8px;
    }

    .health-card {
        display: grid;
        gap: 10px;
        padding: 14px;
    }

    .card-head,
    .badges,
    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .card-head {
        justify-content: space-between;
    }

    .level-pill,
    .badges span {
        height: fit-content;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 11px;
        background: var(--b3-theme-background, #f5f5f5);
    }

    .level-healthy .level-pill {
        color: var(--b3-theme-success, #4CAF50);
        background: rgba(76, 175, 80, 0.1);
    }

    .level-attention .level-pill,
    .level-warning .level-pill {
        color: var(--b3-card-warning-color, #FF9800);
        background: rgba(255, 152, 0, 0.1);
    }

    .level-error .level-pill {
        color: #F44336;
        background: rgba(244, 67, 54, 0.1);
    }

    .suggestion {
        color: var(--b3-theme-primary, #4CAF50);
    }

    .empty {
        padding: 48px;
        text-align: center;
        color: var(--b3-theme-on-surface-light, #666);
    }
</style>
