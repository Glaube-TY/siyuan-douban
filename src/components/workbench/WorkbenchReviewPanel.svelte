<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import type { WorkbenchAction } from "../../types/workbench";
    import type { ReadingManagementSummary } from "../../utils/readingManagement/types";
    import { buildReadingManagementSummary } from "../../utils/readingManagement/managementData";

    export let plugin: any;
    export let refreshKey = 0;

    const dispatch = createEventDispatcher<{ action: WorkbenchAction }>();
    let summary: ReadingManagementSummary | null = null;
    let lastRefreshKey = refreshKey;

    async function load() {
        summary = await buildReadingManagementSummary(plugin);
    }

    onMount(load);

    $: if (refreshKey !== lastRefreshKey) {
        lastRefreshKey = refreshKey;
        load();
    }

    interface CardEntry {
        id: string;
        type: WorkbenchAction;
        label: string;
        icon: string;
        count: number;
        description: string;
    }

    function buildCards(data: ReadingManagementSummary | null): CardEntry[] {
        if (!data) {
            return [
                { id: "inbox", type: "open-inbox", label: "新增笔记", icon: "inbox", count: 0, description: "待处理划线/评论" },
                { id: "block-changes", type: "open-sync-changes", label: "本次块变更", icon: "diagnostics", count: 0, description: "新增 0 / 更新 0 / 删除 0" },
                { id: "unbound-books", type: "open-unbound-books", label: "未绑定书籍", icon: "book", count: 0, description: "无法写入本地笔记" },
                { id: "sync-problems", type: "open-diagnostics", label: "同步问题", icon: "diagnostics", count: 0, description: "失败/异常/警告" },
            ];
        }

        return [
            {
                id: "inbox",
                type: "open-inbox",
                label: "新增笔记",
                icon: "inbox",
                count: data.inboxPendingCount + data.inboxLaterCount,
                description: "待处理划线/评论",
            },
            {
                id: "block-changes",
                type: "open-sync-changes",
                label: "本次块变更",
                icon: "diagnostics",
                count: data.latestBlockChangeCount,
                description: `新增 ${data.latestAddedItemCount} / 更新 ${data.latestChangedItemCount} / 删除 ${data.latestDeletedItemCount}`,
            },
            {
                id: "unbound-books",
                type: "open-unbound-books",
                label: "未绑定书籍",
                icon: "book",
                count: data.unboundBookCount,
                description: "无法写入本地笔记",
            },
            {
                id: "sync-problems",
                type: "open-diagnostics",
                label: "同步问题",
                icon: "diagnostics",
                count: data.syncProblemCount,
                description: "失败/异常/警告",
            },
        ];
    }

    $: cards = buildCards(summary);
</script>

<section class="workbench-panel workbench-review-panel">
    <div class="workbench-panel-head">
        <div class="workbench-panel-title">
            <SiYuanIcon name="review" size={18} />
            <h2>同步后处理</h2>
        </div>
        <button class="workbench-panel-link" on:click={() => dispatch("action", "open-book-health")}>书籍健康</button>
    </div>

    <div class="workbench-review-grid">
        {#each cards as card (card.id)}
            <button on:click={() => dispatch("action", card.type)}>
                <span class="workbench-review-icon"><SiYuanIcon name={card.icon} size={17} /></span>
                <strong>{summary ? card.count : "暂无"}</strong>
                <span>{card.label}</span>
                <em>{card.description}</em>
            </button>
        {/each}
    </div>
</section>

<style>
    .workbench-panel {
        display: grid;
        grid-template-rows: auto 1fr;
        gap: 12px;
        padding: 12px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
        align-content: start;
    }

    .workbench-panel-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
    }

    .workbench-panel-title {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--b3-theme-primary);
    }

    h2 {
        margin: 0;
        color: var(--b3-theme-on-background);
        font-size: 16px;
    }

    .workbench-review-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        grid-template-rows: repeat(2, minmax(120px, 1fr));
        gap: 10px;
    }

    .workbench-panel-link,
    .workbench-review-grid button {
        display: grid;
        gap: 5px;
        min-width: 0;
        min-height: 118px;
        padding: 12px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        cursor: pointer;
        text-align: left;
        align-content: center;
    }

    .workbench-panel-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: unset;
        height: 32px;
        padding: 0 12px;
        font-size: 12px;
    }

    .workbench-review-grid button:hover,
    .workbench-panel-link:hover {
        border-color: var(--b3-theme-primary);
    }

    .workbench-review-icon {
        color: var(--b3-theme-primary);
    }

    strong {
        font-size: 20px;
        line-height: 1.1;
    }

    span {
        font-size: 13px;
        font-weight: 700;
    }

    em {
        overflow: hidden;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        font-style: normal;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    @media (max-width: 920px) {
        .workbench-review-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
</style>
